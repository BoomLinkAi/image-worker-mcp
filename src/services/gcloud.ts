import { z } from 'zod';
import { Storage, Bucket } from '@google-cloud/storage';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { BaseUploadService, UploadServiceConfig, UploadResult, UploadImageArgs } from './types';

export const GCloudEnvConfigSchema = z.object({
  UPLOAD_SERVICE: z.literal('gcloud').optional().default('gcloud'),
  GCLOUD_BUCKET: z.string().min(1, 'GCLOUD_BUCKET is required'),
  GCLOUD_PROJECT_ID: z.string().min(1, 'GCLOUD_PROJECT_ID is required'),
  GCLOUD_CREDENTIALS_PATH: z.string().optional(),
});

export type ValidatedGCloudEnvConfig = z.infer<typeof GCloudEnvConfigSchema>;

export class GCloudUploadService extends BaseUploadService {
  private storage: Storage;
  private bucket: Bucket;

  constructor(validatedEnvConfig: ValidatedGCloudEnvConfig) {
    const serviceConfig: UploadServiceConfig = {
      service: 'gcloud',
      bucket: validatedEnvConfig.GCLOUD_BUCKET,
      projectId: validatedEnvConfig.GCLOUD_PROJECT_ID,
      // clientEmail: validatedEnvConfig.GCLOUD_CLIENT_EMAIL,
      // privateKey: validatedEnvConfig.GCLOUD_PRIVATE_KEY,
    };
    super(serviceConfig);

    const storageOptions: any = {
      projectId: this.config.projectId,
    };

    if (validatedEnvConfig.GCLOUD_CREDENTIALS_PATH) {
      storageOptions.keyFilename = validatedEnvConfig.GCLOUD_CREDENTIALS_PATH;
    }

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.config.bucket!);
  }

  async upload(buffer: Buffer, filename: string, args: UploadImageArgs): Promise<UploadResult> {
    try {
      const key = args.folder ? `${args.folder}/${filename}` : filename;
      const parts = filename.split('.');
      const fileExtension = parts.length > 1 ? parts.pop()?.toLowerCase() || 'jpg' : 'jpg';
      const contentType = this.getContentType(fileExtension);

      const file = this.bucket.file(key);

      // Check if file exists and handle overwrite
      if (!args.overwrite) {
        const exists = await file.exists();
        if (exists[0]) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `File ${key} already exists. Set overwrite=true to replace it.`
          );
        }
      }

      await file.save(buffer, {
        contentType: contentType,
        metadata: args.metadata || {},
        public: args.public,
      });

      const url = this.generateUrl(key);

      return {
        url,
        filename,
        size: buffer.length,
        format: fileExtension,
        service: 'gcloud',
        metadata: {
          bucket: this.config.bucket,
          key,
          projectId: this.config.projectId,
        },
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `GCloud upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getContentType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'avif': 'image/avif',
      'tiff': 'image/tiff',
      'heic': 'image/heic',
      'heif': 'image/heif',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  private generateUrl(key: string): string {
     return `https://storage.googleapis.com/${this.config.bucket}/${key}`;
  }
}