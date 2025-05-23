import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

import { SUPPORTED_INPUT_FORMATS, SUPPORTED_OUTPUT_FORMATS } from './constants';

/**
 * Validates if the provided format is supported for input
 */
export function isValidInputFormat(format: string): boolean {
  return SUPPORTED_INPUT_FORMATS.includes(format.toLowerCase());
}

/**
 * Validates if the provided format is supported for output
 */
export function isValidOutputFormat(format: string): boolean {
  return SUPPORTED_OUTPUT_FORMATS.includes(format.toLowerCase());
}

/**
 * Validates if the provided dimensions are valid
 */
export function isValidDimensions(width?: number, height?: number): boolean {
  if (width !== undefined && (width <= 0 || width > 10000)) {
    return false;
  }
  if (height !== undefined && (height <= 0 || height > 10000)) {
    return false;
  }
  return true;
}

/**
 * Validates if the provided quality is valid
 */
export function isValidQuality(quality?: number): boolean {
  if (quality !== undefined && (quality < 1 || quality > 100)) {
    return false;
  }
  return true;
}

/**
 * Extracts the file extension from a filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Converts a base64 string to a Buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * Converts a Buffer to a base64 string
 */
export function bufferToBase64(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Normalizes a file path by handling escaped characters and spaces
 *
 * This function handles cases like 'a\ name.png' by converting them to 'a name.png'
 */
export function normalizeFilePath(filePath: string): string {
  // Replace escaped spaces (\ ) with actual spaces
  let normalizedPath = filePath.replace(/\\+ /g, ' ');

  // Replace other common escaped characters
  normalizedPath = normalizedPath
    .replace(new RegExp("\\\\+'", 'g'), "'")
    .replace(new RegExp('\\\\+"', 'g'), '"')
    .replace(new RegExp('\\\\+`', 'g'), '`')
    .replace(new RegExp('\\\\+\\(', 'g'), '(')
    .replace(new RegExp('\\\\+\\)', 'g'), ')')
    .replace(new RegExp('\\\\+\\[', 'g'), '[')
    .replace(new RegExp('\\\\+\\]', 'g'), ']')
    .replace(new RegExp('\\\\+\\{', 'g'), '{')
    .replace(new RegExp('\\\\+\\}', 'g'), '}');

  return normalizedPath;
}

/**
 * Fetches an image from a URL and returns it as a Buffer
 */
export async function fetchImageFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url);

    // Check if the response is successful
    if (!response.ok) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Failed to fetch image from URL: ${url}, status code: ${response.status}`,
      );
    }

    // Check if the content type is an image
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `URL does not point to an image: ${url}, content-type: ${contentType}`,
      );
    }

    // Get the response as an ArrayBuffer and convert to Buffer
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error fetching image from URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
