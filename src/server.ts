#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import sharp from 'sharp';
import { z } from 'zod';

import { DEFAULT_HEIGHT, DEFAULT_QUALITY, DEFAULT_WIDTH, SUPPORTED_OUTPUT_FORMATS } from './constants';
import { base64ToBuffer, bufferToBase64, fetchImageFromUrl, isValidInputFormat, normalizeFilePath } from './utils';
import { VERSION } from './version';

// Define Zod schema for image resize arguments
const resizeImageSchema = {
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

class ImageResizeMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: 'image-resize-mcp-server',
      version: VERSION,
    });

    this.setupToolHandlers();
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Define the resize_image tool with zod schema
    this.server.tool('resize_image', 'Resize and transform images', resizeImageSchema, async validatedArgs => {
      try {
        // Validate that at least one of imagePath, imageUrl, or base64Image is provided
        if (!validatedArgs.imagePath && !validatedArgs.imageUrl && !validatedArgs.base64Image) {
          throw new McpError(ErrorCode.InvalidParams, 'One of imagePath, imageUrl, or base64Image must be provided');
        }

        let inputBuffer: Buffer;

        // Get image buffer either from file path or URL
        if (validatedArgs.imagePath) {
          // Read image from file path
          try {
            // Normalize the file path to handle escaped characters
            const normalizedPath = normalizeFilePath(validatedArgs.imagePath);
            inputBuffer = fs.readFileSync(normalizedPath);
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Failed to read image from path: ${validatedArgs.imagePath}. ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else if (validatedArgs.imageUrl) {
          // Fetch image from URL
          inputBuffer = await fetchImageFromUrl(validatedArgs.imageUrl);
        } else if (validatedArgs.base64Image) {
          // Convert base64 to buffer
          inputBuffer = base64ToBuffer(validatedArgs.base64Image);
        } else {
          // This should never happen due to the validation above, but TypeScript needs it
          throw new McpError(ErrorCode.InvalidParams, 'One of imagePath, imageUrl, or base64Image must be provided');
        }

        // Create sharp instance
        let image = sharp(inputBuffer);

        // Get image metadata
        const metadata = await image.metadata();
        const inputFormat = metadata.format;

        if (!inputFormat || !isValidInputFormat(inputFormat)) {
          throw new McpError(ErrorCode.InvalidParams, `Unsupported input format: ${inputFormat}`);
        }

        // Apply transformations

        // Resize
        let width = validatedArgs.width;
        let height = validatedArgs.height;
        let fit = validatedArgs.fit;

        // Handle aspect ratio preservation when only one dimension is provided
        if (width && !height) {
          // If only width is provided, set height to undefined to maintain aspect ratio
          height = undefined;
        } else if (!width && height) {
          // If only height is provided, set width to undefined to maintain aspect ratio
          width = undefined;
        } else {
          // If neither or both dimensions are provided
          width = width || DEFAULT_WIDTH;
          height = height || DEFAULT_HEIGHT;

          // Default to 'contain' fit if both dimensions are provided but no fit is specified
          // This helps maintain aspect ratio even when both dimensions are specified
          if (!fit && width && height) {
            fit = 'contain';
          }
        }

        image = image.resize({
          width,
          height,
          fit,
          position: validatedArgs.position,
          background: validatedArgs.background,
          withoutEnlargement: validatedArgs.withoutEnlargement,
          withoutReduction: validatedArgs.withoutReduction,
        });

        // Rotation and flips
        if (validatedArgs.rotate) {
          image = image.rotate(validatedArgs.rotate);
        }

        if (validatedArgs.flip) {
          image = image.flip();
        }

        if (validatedArgs.flop) {
          image = image.flop();
        }

        // Color manipulations
        if (validatedArgs.grayscale) {
          image = image.grayscale();
        }

        if (validatedArgs.blur) {
          image = image.blur(validatedArgs.blur);
        }

        if (validatedArgs.sharpen) {
          image = image.sharpen(validatedArgs.sharpen);
        }

        if (validatedArgs.gamma) {
          image = image.gamma(validatedArgs.gamma);
        }

        if (validatedArgs.negate) {
          image = image.negate();
        }

        if (validatedArgs.normalize) {
          image = image.normalize();
        }

        if (validatedArgs.threshold) {
          image = image.threshold(validatedArgs.threshold);
        }

        if (validatedArgs.trim) {
          image = image.trim();
        }

        // Output format
        const outputFormat = validatedArgs.format || inputFormat;
        const quality = validatedArgs.quality || DEFAULT_QUALITY;

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

        // Save to file if outputPath is provided
        if (validatedArgs.outputPath) {
          try {
            // Normalize the output path to handle escaped characters
            const normalizedOutputPath = normalizeFilePath(validatedArgs.outputPath);
            fs.writeFileSync(normalizedOutputPath, outputBuffer);
          } catch (writeError) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to save image to ${validatedArgs.outputPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
            );
          }
        }

        // Convert buffer to base64
        const outputBase64 = bufferToBase64(outputBuffer, mimeType);

        // Get final metadata
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
                  savedTo: validatedArgs.outputPath || null,
                  source: validatedArgs.imagePath ? 'file' : validatedArgs.imageUrl ? 'url' : 'base64',
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
            content: [
              {
                type: 'text',
                text: `Validation error: ${JSON.stringify(error.format(), null, 2)}`,
              },
            ],
            isError: true,
          };
        }

        if (error instanceof McpError) {
          throw error;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error processing image: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // No need for backward compatibility handlers with the new SDK
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Image Resize MCP server running on stdio');
  }
}

// Export the server class
export { ImageResizeMcpServer };
