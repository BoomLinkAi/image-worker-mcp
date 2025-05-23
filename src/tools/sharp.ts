import { z } from 'zod';
import fs from 'fs';
import sharp, { Sharp } from 'sharp';
import { ErrorCode, McpError, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { SUPPORTED_OUTPUT_FORMATS, DEFAULT_HEIGHT, DEFAULT_QUALITY, DEFAULT_WIDTH } from '../constants';
import { base64ToBuffer, bufferToBase64, fetchImageFromUrl, isValidInputFormat, normalizeFilePath } from '../utils';

// Define Zod schema for image resize arguments
export const resizeImageSchema = {
  imagePath: z
    .string({
      description: 'Path to image',
    })
    .optional(),
  imageUrl: z
    .string({
      description: 'URL to image',
    })
    .optional(),
  base64Image: z
    .string({
      description: 'Base64-encoded image data (with or without data URL prefix)',
    })
    .optional(),
  format: z.enum(SUPPORTED_OUTPUT_FORMATS as [string, ...string[]]).optional(),
  width: z.number().min(1).max(10000).optional(),
  height: z.number().min(1).max(10000).optional(),
  quality: z.number().min(1).max(100).optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
  position: z
    .enum(['centre', 'center', 'north', 'east', 'south', 'west', 'northeast', 'southeast', 'southwest', 'northwest'])
    .optional(),
  background: z.string().optional(),
  withoutEnlargement: z.boolean().optional(),
  withoutReduction: z.boolean().optional(),
  rotate: z.number().optional(),
  flip: z.boolean().optional(),
  flop: z.boolean().optional(),
  grayscale: z.boolean().optional(),
  blur: z.number().min(0.3).max(1000).optional(),
  sharpen: z.number().min(0.3).max(1000).optional(),
  gamma: z.number().min(1.0).max(3.0).optional(),
  negate: z.boolean().optional(),
  normalize: z.boolean().optional(),
  threshold: z.number().min(0).max(255).optional(),
  trim: z.boolean().optional(),
  outputPath: z
    .string({
      description: 'Path to save the resized image (if not provided, image will only be returned as base64)',
    })
    .optional(),
};

type ResizeImageArgs = z.infer<z.ZodObject<typeof resizeImageSchema>>;

class ImageProcessor {
  private args: ResizeImageArgs;
  private inputFormat?: string;

  constructor(validatedArgs: ResizeImageArgs) {
    this.args = validatedArgs;
  }

  private async getInputBuffer(): Promise<Buffer> {
    if (!this.args.imagePath && !this.args.imageUrl && !this.args.base64Image) {
      throw new McpError(ErrorCode.InvalidParams, 'One of imagePath, imageUrl, or base64Image must be provided');
    }

    let inputBuffer: Buffer;

    if (this.args.imagePath) {
      try {
        const normalizedPath = normalizeFilePath(this.args.imagePath);
        inputBuffer = fs.readFileSync(normalizedPath);
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Failed to read image from path: ${this.args.imagePath}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (this.args.imageUrl) {
      inputBuffer = await fetchImageFromUrl(this.args.imageUrl);
    } else if (this.args.base64Image) {
      inputBuffer = base64ToBuffer(this.args.base64Image);
    } else {
      // Should be unreachable due to the initial check
      throw new McpError(ErrorCode.InternalError, 'No image source provided despite initial validation.');
    }
    return inputBuffer;
  }

  private async validateAndInitializeSharp(inputBuffer: Buffer): Promise<Sharp> {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    this.inputFormat = metadata.format;

    if (!this.inputFormat || !isValidInputFormat(this.inputFormat)) {
      throw new McpError(ErrorCode.InvalidParams, `Unsupported input format: ${this.inputFormat}`);
    }
    return image;
  }

  private applyResize(image: Sharp): Sharp {
    let width = this.args.width;
    let height = this.args.height;
    let fit = this.args.fit;

    if (width && !height) {
      height = undefined;
    } else if (!width && height) {
      width = undefined;
    } else {
      width = width || DEFAULT_WIDTH;
      height = height || DEFAULT_HEIGHT;
      if (!fit && width && height) {
        fit = 'contain';
      }
    }

    return image.resize({
      width,
      height,
      fit,
      position: this.args.position,
      background: this.args.background,
      withoutEnlargement: this.args.withoutEnlargement,
      withoutReduction: this.args.withoutReduction,
    });
  }

  private applyTransformations(image: Sharp): Sharp {
    let transformedImage = image;
    if (this.args.rotate) {
      transformedImage = transformedImage.rotate(this.args.rotate);
    }
    if (this.args.flip) {
      transformedImage = transformedImage.flip();
    }
    if (this.args.flop) {
      transformedImage = transformedImage.flop();
    }
    if (this.args.grayscale) {
      transformedImage = transformedImage.grayscale();
    }
    if (this.args.blur) {
      transformedImage = transformedImage.blur(this.args.blur);
    }
    if (this.args.sharpen) {
      transformedImage = transformedImage.sharpen(this.args.sharpen);
    }
    if (this.args.gamma) {
      transformedImage = transformedImage.gamma(this.args.gamma);
    }
    if (this.args.negate) {
      transformedImage = transformedImage.negate();
    }
    if (this.args.normalize) {
      transformedImage = transformedImage.normalize();
    }
    if (this.args.threshold) {
      transformedImage = transformedImage.threshold(this.args.threshold);
    }
    if (this.args.trim) {
      transformedImage = transformedImage.trim();
    }
    return transformedImage;
  }

  private async formatOutput(image: Sharp): Promise<{ outputBuffer: Buffer; mimeType: string; outputFormat: string }> {
    const outputFormat = this.args.format || this.inputFormat || 'jpeg'; // Default to jpeg if inputFormat is somehow undefined
    const quality = this.args.quality || DEFAULT_QUALITY;
    let outputBuffer: Buffer;
    let mimeType: string;

    switch (outputFormat) {
      case 'jpeg':
      case 'jpg':
        outputBuffer = await image.jpeg({ quality }).toBuffer();
        mimeType = 'image/jpeg';
        break;
      case 'png':
        outputBuffer = await image.png({ quality }).toBuffer();
        mimeType = 'image/png';
        break;
      case 'webp':
        outputBuffer = await image.webp({ quality }).toBuffer();
        mimeType = 'image/webp';
        break;
      case 'avif':
        outputBuffer = await image.avif({ quality }).toBuffer();
        mimeType = 'image/avif';
        break;
      default:
        throw new McpError(ErrorCode.InvalidParams, `Unsupported output format: ${outputFormat}`);
    }
    return { outputBuffer, mimeType, outputFormat };
  }

  private async saveToFile(outputBuffer: Buffer): Promise<void> {
    if (this.args.outputPath) {
      try {
        const normalizedOutputPath = normalizeFilePath(this.args.outputPath);
        fs.writeFileSync(normalizedOutputPath, outputBuffer);
      } catch (writeError) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to save image to ${this.args.outputPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
        );
      }
    }
  }

  public async exec(): Promise<CallToolResult> {
    try {
      const inputBuffer = await this.getInputBuffer();
      let image = await this.validateAndInitializeSharp(inputBuffer);

      image = this.applyResize(image);
      image = this.applyTransformations(image);

      const { outputBuffer, mimeType, outputFormat } = await this.formatOutput(image);
      await this.saveToFile(outputBuffer);

      const outputBase64 = bufferToBase64(outputBuffer, mimeType);
      const finalMetadata = await sharp(outputBuffer).metadata();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                image: outputBase64,
                format: outputFormat,
                width: finalMetadata.width,
                height: finalMetadata.height,
                size: outputBuffer.length,
                savedTo: this.args.outputPath || null,
                source: this.args.imagePath ? 'file' : this.args.imageUrl ? 'url' : 'base64',
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) { // This case might not be hit if Zod validation happens before calling exec
        return {
          content: [{ type: 'text', text: `Validation error: ${JSON.stringify(error.format(), null, 2)}` }],
          isError: true,
        };
      }
      if (error instanceof McpError) {
        throw error; // Re-throw McpError to be handled by the server
      }
      // Catch any other unexpected errors
      return {
        content: [{ type: 'text', text: `Error processing image: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
}

export async function resizeImageTool(validatedArgs: ResizeImageArgs): Promise<CallToolResult> {
  const processor = new ImageProcessor(validatedArgs);
  return processor.exec();
}