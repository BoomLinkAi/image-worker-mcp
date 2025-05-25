import { z } from 'zod';
import fs from 'fs';
import sharp, { Sharp } from 'sharp';
import { ErrorCode, McpError, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import libheif from 'libheif-js/wasm-bundle';

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
  format: z.enum(SUPPORTED_OUTPUT_FORMATS as [string, ...string[]]).optional().describe("Output image format"),
  width: z.number().min(1).max(10000).optional().describe("Width of the resized image in pixels"),
  height: z.number().min(1).max(10000).optional().describe("Height of the resized image in pixels"),
  quality: z.number().min(1).max(100).optional().describe("Quality of the output image (1-100)"),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional().describe("How the image should be resized to fit both provided dimensions"),
  position: z
    .enum(['top', 'right top', 'right', 'right bottom', 'bottom', 'left bottom', 'left', 'left top'])
    .optional()
    .describe("Position when using fit 'cover' or 'contain'"),
  background: z.string().optional().describe("Background color when using fit 'contain' or 'cover', or when extending. Accepts hex, rgb, rgba, or CSS color names"),
  withoutEnlargement: z.boolean().optional().describe("Do not enlarge if the width or height are already less than the specified dimensions"),
  withoutReduction: z.boolean().optional().describe("Do not reduce if the width or height are already greater than the specified dimensions"),
  rotate: z.number().optional().describe("Angle of rotation (positive for clockwise, negative for counter-clockwise)"),
  flip: z.boolean().optional().describe("Flip the image vertically"),
  flop: z.boolean().optional().describe("Flop the image horizontally"),
  grayscale: z.boolean().optional().describe("Convert the image to grayscale"),
  blur: z.number().min(0.3).max(1000).optional().describe("Apply a Gaussian blur. Value is the sigma of the Gaussian kernel (0.3-1000)"),
  sharpen: z.number().min(0.3).max(1000).optional().describe("Apply a sharpening. Value is the sigma of the Gaussian kernel (0.3-1000)"),
  gamma: z.number().min(1.0).max(3.0).optional().describe("Apply gamma correction (1.0-3.0)"),
  negate: z.boolean().optional().describe("Produce a negative of the image"),
  normalize: z.boolean().optional().describe("Enhance image contrast by stretching its intensity levels"),
  threshold: z.number().min(0).max(255).optional().describe("Apply a threshold to the image, turning pixels above the threshold white and below black (0-255)"),
  trim: z.boolean().optional().describe("Trim 'boring' pixels from all edges that contain values similar to the top-left pixel"),
  outputImage: z.boolean().optional().default(false).describe("Whether to include the base64-encoded image in the output response"),
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

  private isHeif(buffer: Buffer): boolean {
    const signature = buffer.toString('ascii', 4, 12);
    return ['ftypheic', 'ftypheix', 'ftyphevc', 'ftyphevx', 'ftypmif1', 'ftypmsf1'].some((s) => signature.includes(s));
  }

  private async validateAndInitializeSharp(inputBuffer: Buffer): Promise<Sharp> {
    if (this.isHeif(inputBuffer)) {
      try {
        const decoder = new libheif.HeifDecoder();
        const decodedImages = decoder.decode(inputBuffer);
        if (!decodedImages || decodedImages.length === 0) {
          throw new Error('HEIF decoding failed or produced no images.');
        }
        // Use the first image
        const heifImage = decodedImages[0];
        const width = heifImage.get_width();
        const height = heifImage.get_height();
        const imageData = await new Promise<any>((resolve, reject) => {
          heifImage.display({ data: new Uint8ClampedArray(width*height*4), width, height }, (displayData) => {
            if (!displayData) {
              return reject(new Error('HEIF processing error'));
            }

            resolve(displayData);
          });
        });
        const { data } = imageData;

        // Convert data (ArrayBufferLike) to Buffer
        const pixelBuffer = Buffer.from(data);

        this.inputFormat = 'heic'; // Or 'heif', could be refined if libheif-js provides more specific format
        // Sharp can process raw pixel data
        return sharp(pixelBuffer, {
          raw: {
            width: width,
            height: height,
            channels: 4, // Assuming RGBA, common for HEIF decoders
          },
        });
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Failed to decode HEIF image: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();
      this.inputFormat = metadata.format;

      if (!this.inputFormat || !isValidInputFormat(this.inputFormat)) {
        throw new McpError(ErrorCode.InvalidParams, `Unsupported input format: ${this.inputFormat}`);
      }
      return image;
    }
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
                ...(this.args.outputImage ? { image: outputBase64 } : {}),
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
