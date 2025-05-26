import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

vi.mock('../../src/utils', () => ({
  fetchImageFromUrl: vi.fn(),
  base64ToBuffer: vi.fn(),
  normalizeFilePath: vi.fn(),
}));

vi.mock('../../src/services', async () => {
  const actual = await vi.importActual('../../src/services') as Record<string, any>;
  return {
    ...actual,
    UploadServiceFactory: {
      create: vi.fn(),
    },
  };
});

// Mock process.env

// Import after mocking
import fs from 'fs';
import { fetchImageFromUrl, base64ToBuffer, normalizeFilePath } from '../../src/utils';
import { UploadServiceFactory, UploadImageArgs } from '../../src/services';
import { UploadTool } from '../../src/tools/upload';

// Get mocked functions
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockFetchImageFromUrl = vi.mocked(fetchImageFromUrl);
const mockBase64ToBuffer = vi.mocked(base64ToBuffer);
const mockNormalizeFilePath = vi.mocked(normalizeFilePath);
const mockUploadServiceFactoryCreate = vi.mocked(UploadServiceFactory.create);


describe('Upload Tool', () => {
  let mockBuffer: Buffer;
  let mockUploadServiceInstance: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    process.env.UPLOAD_SERVICE = 's3';
    process.env.S3_BUCKET = 'mock-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'mock-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret';
    process.env.S3_REGION = 'us-east-1';

    mockBuffer = Buffer.from('test image data');
    
    mockUploadServiceInstance = {
      upload: vi.fn().mockResolvedValue({
        url: 'https://example.com/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 's3', // Default or example service
        metadata: { bucket: 'test-bucket', key: 'test.jpg' },
      }),
    };
    
    mockUploadServiceFactoryCreate.mockReturnValue(mockUploadServiceInstance);
    
    mockNormalizeFilePath.mockImplementation((path: string) => path);
    mockBase64ToBuffer.mockReturnValue(mockBuffer);
    mockFetchImageFromUrl.mockResolvedValue(mockBuffer);
    mockReadFileSync.mockReturnValue(mockBuffer);
  });

  afterEach(() => {
    process.env = originalEnv;
  });


  describe('UploadTool execution', () => {
    // Helper to call the tool's exec method
    const executeUploadTool = async (args: UploadImageArgs) => {
      const toolInstance = new UploadTool(args, mockUploadServiceInstance);
      return toolInstance.exec();
    };

    it('should upload image from imagePath', async () => {
      const args: UploadImageArgs = { imagePath: 'test.jpg', service: 's3' };
      const result = await executeUploadTool(args);
      expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, 'test.jpg', args);
      expect(result.isError).toBeFalsy();
      if (result.content && result.content.length > 0 && result.content[0].type === 'text') {
        const parsedResult = JSON.parse(result.content[0].text);
        expect(parsedResult.url).toBe('https://example.com/test.jpg');
      } else {
        throw new Error('Expected text content for successful upload from imagePath');
      }
    });

    it('should upload image from imageUrl', async () => {
      const args: UploadImageArgs = { imageUrl: 'http://example.com/image.png', service: 's3' };
      const result = await executeUploadTool(args);
      expect(mockFetchImageFromUrl).toHaveBeenCalledWith('http://example.com/image.png');
      expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, 'image.png', args);
      expect(result.isError).toBeFalsy();
      if (result.content && result.content.length > 0 && result.content[0].type === 'text') {
        const parsedResult = JSON.parse(result.content[0].text);
        expect(parsedResult.url).toBe('https://example.com/test.jpg');
      } else {
        throw new Error('Expected text content for successful upload from imageUrl');
      }
    });

    it('should upload image from base64Image', async () => {
      const args: UploadImageArgs = { base64Image: 'base64stringdata', service: 's3' };
      const result = await executeUploadTool(args);
      expect(mockBase64ToBuffer).toHaveBeenCalledWith('base64stringdata');
      expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, expect.any(String), args);
      expect(result.isError).toBeFalsy();
      if (result.content && result.content.length > 0 && result.content[0].type === 'text') {
        const parsedResult = JSON.parse(result.content[0].text);
        expect(parsedResult.url).toBe('https://example.com/test.jpg');
      } else {
        throw new Error('Expected text content for successful upload from base64Image');
      }
    });
    
    it('should return McpErrorResponse if no image source provided', async () => {
      const args: UploadImageArgs = {};
      // Expecting McpError to be thrown by the tool's getInputBuffer method
      try {
        await executeUploadTool(args);
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toBe('MCP error -32602: One of imagePath, imageUrl, or base64Image must be provided');
      }
    });

    it('should use custom filename if provided', async () => {
      const args: UploadImageArgs = { imagePath: 'original.jpg', filename: 'custom-name', service: 's3' };
      await executeUploadTool(args);
      expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, 'custom-name.jpg', args);
    });
    
    it('should handle filename with existing extension', async () => {
        const args: UploadImageArgs = { imagePath: 'path/to/image.png', filename: 'custom.png', service: 's3'};
        await executeUploadTool(args);
        expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, 'custom.png', args);
    });

    it('should handle filename without extension (derive from imagePath)', async () => {
        const args: UploadImageArgs = { imagePath: 'path/to/image.jpeg', filename: 'customNoExt', service: 's3'};
        await executeUploadTool(args);
        expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, 'customNoExt.jpeg', args);
    });
    
    it('should return McpErrorResponse if imagePath does not exist', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('File not found'); });
      const args: UploadImageArgs = { imagePath: 'nonexistent.jpg', service: 's3' };
      try {
        await executeUploadTool(args);
      } catch (error: any) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toBe('MCP error -32602: Failed to read image from path: nonexistent.jpg. File not found');
      }
    });

    it('should return McpErrorResponse if imageUrl fetch fails', async () => {
      mockFetchImageFromUrl.mockRejectedValue(new Error('Network error'));
      const args: UploadImageArgs = { imageUrl: 'http://badurl.com/image.jpg', service: 's3' };
      const result = await executeUploadTool(args) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error uploading image: Network error');
    });

    it('should return McpErrorResponse if base64ToBuffer fails', async () => {
      mockBase64ToBuffer.mockImplementation(() => { throw new Error('Invalid base64'); });
      const args: UploadImageArgs = { base64Image: 'invalidbase64==', service: 's3' };
      const result = await executeUploadTool(args) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error uploading image: Invalid base64');
    });
    
    it('should correctly pass through all args to upload service', async () => {
      const fullArgs: UploadImageArgs = {
        imagePath: 'test.webp',
        service: 's3',
        filename: 'final-name',
        folder: 'test-folder',
        public: false,
        overwrite: true,
        tags: ['tag1', 'tag2'],
        metadata: { key1: 'value1' }
      };
      await executeUploadTool(fullArgs);
      expect(mockUploadServiceInstance.upload).toHaveBeenCalledWith(mockBuffer, 'final-name.webp', fullArgs);
    });
  });
});
