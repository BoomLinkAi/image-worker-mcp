import { z } from 'zod';
import fs from 'fs';
import { ErrorCode, McpError, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { base64ToBuffer, fetchImageFromUrl, normalizeFilePath } from '../utils';
import { SUPPORTED_UPLOAD_SERVICES } from '../constants';
import {
  UploadService,
  UploadServiceConfig,
  BaseUploadService,
  UploadServiceFactory
} from '../services';

// Re-export the upload service type for external use
export type { UploadService } from '../services';

// Define Zod schema for upload arguments
export const uploadImageSchema = {
  imagePath: z
    .string({
      description: 'Path to image file to upload',
    })
    .optional(),
  imageUrl: z
    .string({
      description: 'URL to image to download and upload',
    })
    .optional(),
  base64Image: z
    .string({
      description: 'Base64-encoded image data (with or without data URL prefix)',
    })
    .optional(),
  service: z
    .enum(SUPPORTED_UPLOAD_SERVICES)
    .optional()
    .default('s3')
    .describe('Upload service to use'),
  filename: z
    .string()
    .optional()
    .describe('Custom filename for the uploaded image (without extension)'),
  folder: z
    .string()
    .optional()
    .describe('Folder/directory to upload to (service-specific)'),
  public: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether the uploaded image should be publicly accessible'),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to overwrite existing files with the same name'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags to associate with the uploaded image (service-specific)'),
  metadata: z
    .record(z.string())
    .optional()
    .describe('Additional metadata to store with the image (service-specific)'),
};

type UploadImageArgs = z.infer<z.ZodObject<typeof uploadImageSchema>>;

// Main upload tool class
class UploadTool {
  private args: UploadImageArgs;
  private uploadService: BaseUploadService;

  constructor(validatedArgs: UploadImageArgs, config: UploadServiceConfig) {
    this.args = validatedArgs;
    this.uploadService = UploadServiceFactory.create(config);
    this.uploadService.validateConfig();
  }

  private async getInputBuffer(): Promise<{ buffer: Buffer; originalFilename?: string }> {
    if (!this.args.imagePath && !this.args.imageUrl && !this.args.base64Image) {
      throw new McpError(ErrorCode.InvalidParams, 'One of imagePath, imageUrl, or base64Image must be provided');
    }

    let buffer: Buffer;
    let originalFilename: string | undefined;

    if (this.args.imagePath) {
      try {
        const normalizedPath = normalizeFilePath(this.args.imagePath);
        buffer = fs.readFileSync(normalizedPath);
        originalFilename = normalizedPath.split('/').pop();
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Failed to read image from path: ${this.args.imagePath}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (this.args.imageUrl) {
      buffer = await fetchImageFromUrl(this.args.imageUrl);
      originalFilename = this.args.imageUrl.split('/').pop()?.split('?')[0];
    } else if (this.args.base64Image) {
      buffer = base64ToBuffer(this.args.base64Image);
      originalFilename = 'image';
    } else {
      throw new McpError(ErrorCode.InternalError, 'No image source provided despite initial validation.');
    }

    return { buffer, originalFilename };
  }

  private generateFilename(originalFilename?: string): string {
    if (this.args.filename) {
      // If custom filename provided, use it but ensure it has an extension
      const hasExtension = this.args.filename.includes('.');
      if (hasExtension) {
        return this.args.filename;
      } else {
        // Extract extension from original filename or default to jpg
        const extension = originalFilename?.split('.').pop() || 'jpg';
        return `${this.args.filename}.${extension}`;
      }
    }

    if (originalFilename) {
      return originalFilename;
    }

    // Generate a unique filename with timestamp
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `image_${timestamp}_${randomSuffix}.jpg`;
  }

  public async exec(): Promise<CallToolResult> {
    try {
      const { buffer, originalFilename } = await this.getInputBuffer();
      const filename = this.generateFilename(originalFilename);

      const result = await this.uploadService.upload(buffer, filename, this.args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                url: result.url,
                filename: result.filename,
                size: result.size,
                format: result.format,
                service: result.service,
                ...(result.width && { width: result.width }),
                ...(result.height && { height: result.height }),
                ...(result.publicId && { publicId: result.publicId }),
                ...(result.metadata && { metadata: result.metadata }),
                uploadedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [{ type: 'text', text: `Validation error: ${JSON.stringify(error.format(), null, 2)}` }],
          isError: true,
        };
      }
      if (error instanceof McpError) {
        throw error;
      }
      return {
        content: [{ type: 'text', text: `Error uploading image: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
}

// Configuration loader from environment variables and command line
export function loadUploadConfig(service?: UploadService): UploadServiceConfig {
  const selectedService = service || (process.env.UPLOAD_SERVICE as UploadService) || 's3';

  const config: UploadServiceConfig = {
    service: selectedService,
  };

  switch (selectedService) {
    case 's3':
      config.apiKey = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY;
      config.apiSecret = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY;
      config.bucket = process.env.S3_BUCKET;
      config.region = process.env.S3_REGION || 'us-east-1';
      config.endpoint = process.env.S3_ENDPOINT;
      break;
    case 'cloudflare':
      config.apiKey = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.CF_ACCESS_KEY;
      config.apiSecret = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.CF_SECRET_KEY;
      config.bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.CF_BUCKET;
      config.region = process.env.CLOUDFLARE_R2_REGION || 'auto';
      config.endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || process.env.CF_ENDPOINT;
      break;
  }

  return config;
}

// Main tool function
export async function uploadImageTool(validatedArgs: UploadImageArgs): Promise<CallToolResult> {
  const config = loadUploadConfig(validatedArgs.service);
  const tool = new UploadTool(validatedArgs, config);
  return tool.exec();
}
