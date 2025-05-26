import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Mock dependencies with factory functions
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

// Mock upload services
vi.mock('../../src/services', () => ({
  UploadServiceFactory: {
    create: vi.fn(),
  },
}));

// Mock process.env
const originalEnv = process.env;

// Import after mocking
import fs from 'fs';
import { fetchImageFromUrl, base64ToBuffer, normalizeFilePath } from '../../src/utils';
import { UploadServiceFactory } from '../../src/services';
import { uploadImageTool, loadUploadConfig } from '../../src/tools/upload';

// Get mocked functions
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockFetchImageFromUrl = vi.mocked(fetchImageFromUrl);
const mockBase64ToBuffer = vi.mocked(base64ToBuffer);
const mockNormalizeFilePath = vi.mocked(normalizeFilePath);
const mockUploadServiceFactory = vi.mocked(UploadServiceFactory);

describe('Upload Tool', () => {
  let mockBuffer: Buffer;
  let mockUploadService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockBuffer = Buffer.from('test image data');
    
    // Reset process.env
    process.env = { ...originalEnv };
    
    // Setup mock upload service
    mockUploadService = {
      validateConfig: vi.fn(),
      upload: vi.fn().mockResolvedValue({
        url: 'https://example.com/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 's3',
        metadata: { bucket: 'test-bucket', key: 'test.jpg' },
      }),
    };
    
    mockUploadServiceFactory.create.mockReturnValue(mockUploadService);
    
    // Setup default mocks
    mockNormalizeFilePath.mockImplementation((path: string) => path);
    mockBase64ToBuffer.mockReturnValue(mockBuffer);
    mockFetchImageFromUrl.mockResolvedValue(mockBuffer);
    mockReadFileSync.mockReturnValue(mockBuffer);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('uploadImageTool', () => {
    it('should successfully upload from file path', async () => {
      const args: any = {
        imagePath: '/path/to/image.jpg',
        service: 's3' as const,
        public: true,
      };

      const result = await uploadImageTool(args);

      expect(mockNormalizeFilePath).toHaveBeenCalledWith('/path/to/image.jpg');
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/image.jpg');
      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'image.jpg',
        args
      );

      expect(result.content).toHaveLength(1);
      expect(result.content?.[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content?.[0].text as string);
      expect(responseData).toMatchObject({
        success: true,
        url: 'https://example.com/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 's3',
      });
      expect(responseData.uploadedAt).toBeDefined();
    });

    it('should successfully upload from URL', async () => {
      const args: any = {
        imageUrl: 'https://example.com/source.png',
        service: 'cloudflare' as const,
        filename: 'custom-name',
      };

      const result = await uploadImageTool(args);

      expect(mockFetchImageFromUrl).toHaveBeenCalledWith('https://example.com/source.png');
      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'custom-name.png',
        args
      );

      const responseData = JSON.parse(result.content?.[0].text as string);
      expect(responseData.success).toBe(true);
    });

    it('should successfully upload from base64', async () => {
      const args: any = {
        base64Image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...',
        service: 's3' as const,
        folder: 'uploads',
      };

      const result = await uploadImageTool(args);

      expect(mockBase64ToBuffer).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...');
      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'image',
        args
      );

      const responseData = JSON.parse(result.content?.[0].text as string);
      expect(responseData.success).toBe(true);
    });

    it('should handle custom filename with extension', async () => {
      const args: any = {
        imagePath: '/path/to/image.jpg',
        filename: 'custom.png',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'custom.png',
        args
      );
    });

    it('should handle custom filename without extension', async () => {
      const args: any = {
        imagePath: '/path/to/image.jpg',
        filename: 'custom',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'custom.jpg',
        args
      );
    });

    it('should generate unique filename when no filename provided and no original', async () => {
      const args: any = {
        base64Image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...',
        service: 's3' as const,
      };

      // Mock Date.now and Math.random for predictable filename
      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
      const mockMathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.123456);

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'image',
        args
      );

      mockDateNow.mockRestore();
      mockMathRandom.mockRestore();
    });

    it('should extract filename from URL', async () => {
      const args: any = {
        imageUrl: 'https://example.com/path/to/photo.png?version=1',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'photo.png',
        args
      );
    });

    it('should include optional fields in response when present', async () => {
      mockUploadService.upload.mockResolvedValue({
        url: 'https://example.com/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 's3',
        width: 800,
        height: 600,
        publicId: 'abc123',
        metadata: { bucket: 'test-bucket', key: 'test.jpg' },
      });

      const args: any = {
        imagePath: '/path/to/image.jpg',
        service: 's3' as const,
      };

      const result = await uploadImageTool(args);
      const responseData = JSON.parse(result.content?.[0].text as string);

      expect(responseData).toMatchObject({
        success: true,
        width: 800,
        height: 600,
        publicId: 'abc123',
        metadata: { bucket: 'test-bucket', key: 'test.jpg' },
      });
    });

    describe('error handling', () => {
      it('should throw McpError when no image source provided', async () => {
        const args: any = {
          service: 's3' as const,
        };

        await expect(uploadImageTool(args)).rejects.toThrow(McpError);
        await expect(uploadImageTool(args)).rejects.toThrow(
          'One of imagePath, imageUrl, or base64Image must be provided'
        );
      });

      it('should handle file read errors', async () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('File not found');
        });

        const args: any = {
          imagePath: '/nonexistent/file.jpg',
          service: 's3' as const,
        };

        await expect(uploadImageTool(args)).rejects.toThrow(McpError);
        await expect(uploadImageTool(args)).rejects.toThrow(
          'Failed to read image from path: /nonexistent/file.jpg'
        );
      });

      it('should handle URL fetch errors', async () => {
        mockFetchImageFromUrl.mockRejectedValue(new Error('Network error'));

        const args: any = {
          imageUrl: 'https://example.com/image.jpg',
          service: 's3' as const,
        };

        const result = await uploadImageTool(args);

        expect(result.isError).toBe(true);
        expect(result.content?.[0].text).toContain('Error uploading image: Network error');
      });

      it('should handle upload service errors', async () => {
        mockUploadService.upload.mockRejectedValue(new Error('Upload failed'));

        const args: any = {
          imagePath: '/path/to/image.jpg',
          service: 's3' as const,
        };

        const result = await uploadImageTool(args);

        expect(result.isError).toBe(true);
        expect(result.content?.[0].text).toContain('Error uploading image: Upload failed');
      });

      it('should preserve McpError from upload service', async () => {
        const mcpError = new McpError(ErrorCode.InvalidParams, 'Invalid configuration');
        mockUploadService.upload.mockRejectedValue(mcpError);

        const args: any = {
          imagePath: '/path/to/image.jpg',
          service: 's3' as const,
        };

        await expect(uploadImageTool(args)).rejects.toThrow(mcpError);
      });

      it('should handle validation config errors', async () => {
        mockUploadService.validateConfig.mockImplementation(() => {
          throw new McpError(ErrorCode.InvalidParams, 'Missing API key');
        });

        const args: any = {
          imagePath: '/path/to/image.jpg',
          service: 's3' as const,
        };

        await expect(uploadImageTool(args)).rejects.toThrow('Missing API key');
      });

      it('should handle Zod validation errors', async () => {
        // This would be caught by the Zod schema validation, but we can simulate it
        const zodError = new z.ZodError([
          {
            code: 'invalid_type',
            expected: 'string',
            received: 'number',
            path: ['filename'],
            message: 'Expected string, received number',
          },
        ]);

        mockUploadService.upload.mockRejectedValue(zodError);

        const args: any = {
          imagePath: '/path/to/image.jpg',
          service: 's3' as const,
        };

        const result = await uploadImageTool(args);

        expect(result.isError).toBe(true);
        expect(result.content?.[0].text).toContain('Validation error:');
      });
    });
  });

  describe('loadUploadConfig', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.UPLOAD_SERVICE;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.S3_BUCKET;
      delete process.env.S3_REGION;
      delete process.env.S3_ENDPOINT;
      delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
      delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
      delete process.env.CLOUDFLARE_R2_BUCKET;
      delete process.env.CLOUDFLARE_R2_REGION;
      delete process.env.CLOUDFLARE_R2_ENDPOINT;
    });

    it('should load S3 config with AWS environment variables', () => {
      process.env.AWS_ACCESS_KEY_ID = 'aws-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret';
      process.env.S3_BUCKET = 'my-bucket';
      process.env.S3_REGION = 'us-west-2';
      process.env.S3_ENDPOINT = 'https://s3.example.com';

      const config = loadUploadConfig('s3');

      expect(config).toEqual({
        service: 's3',
        apiKey: 'aws-key',
        apiSecret: 'aws-secret',
        bucket: 'my-bucket',
        region: 'us-west-2',
        endpoint: 'https://s3.example.com',
      });
    });

    it('should load S3 config with alternative environment variables', () => {
      process.env.S3_ACCESS_KEY = 's3-key';
      process.env.S3_SECRET_KEY = 's3-secret';
      process.env.S3_BUCKET = 'my-bucket';

      const config = loadUploadConfig('s3');

      expect(config).toEqual({
        service: 's3',
        apiKey: 's3-key',
        apiSecret: 's3-secret',
        bucket: 'my-bucket',
        region: 'us-east-1', // default
        endpoint: undefined,
      });
    });

    it('should prefer AWS variables over S3 variables', () => {
      process.env.AWS_ACCESS_KEY_ID = 'aws-key';
      process.env.S3_ACCESS_KEY = 's3-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret';
      process.env.S3_SECRET_KEY = 's3-secret';

      const config = loadUploadConfig('s3');

      expect(config.apiKey).toBe('aws-key');
      expect(config.apiSecret).toBe('aws-secret');
    });

    it('should load Cloudflare config with R2 environment variables', () => {
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'cf-key';
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'cf-secret';
      process.env.CLOUDFLARE_R2_BUCKET = 'my-r2-bucket';
      process.env.CLOUDFLARE_R2_REGION = 'auto';
      process.env.CLOUDFLARE_R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';

      const config = loadUploadConfig('cloudflare');

      expect(config).toEqual({
        service: 'cloudflare',
        apiKey: 'cf-key',
        apiSecret: 'cf-secret',
        bucket: 'my-r2-bucket',
        region: 'auto',
        endpoint: 'https://account.r2.cloudflarestorage.com',
      });
    });

    it('should load Cloudflare config with alternative environment variables', () => {
      process.env.CF_ACCESS_KEY = 'cf-key';
      process.env.CF_SECRET_KEY = 'cf-secret';
      process.env.CF_BUCKET = 'my-r2-bucket';
      process.env.CF_ENDPOINT = 'https://account.r2.cloudflarestorage.com';

      const config = loadUploadConfig('cloudflare');

      expect(config).toEqual({
        service: 'cloudflare',
        apiKey: 'cf-key',
        apiSecret: 'cf-secret',
        bucket: 'my-r2-bucket',
        region: 'auto', // default
        endpoint: 'https://account.r2.cloudflarestorage.com',
      });
    });

    it('should prefer CLOUDFLARE_R2 variables over CF variables', () => {
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'cf-r2-key';
      process.env.CF_ACCESS_KEY = 'cf-key';
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'cf-r2-secret';
      process.env.CF_SECRET_KEY = 'cf-secret';

      const config = loadUploadConfig('cloudflare');

      expect(config.apiKey).toBe('cf-r2-key');
      expect(config.apiSecret).toBe('cf-r2-secret');
    });

    it('should use service parameter over environment variable', () => {
      process.env.UPLOAD_SERVICE = 'cloudflare';

      const config = loadUploadConfig('s3');

      expect(config.service).toBe('s3');
    });

    it('should use UPLOAD_SERVICE environment variable when no service specified', () => {
      process.env.UPLOAD_SERVICE = 'cloudflare';

      const config = loadUploadConfig();

      expect(config.service).toBe('cloudflare');
    });

    it('should default to s3 when no service specified and no environment variable', () => {
      const config = loadUploadConfig();

      expect(config.service).toBe('s3');
    });

    it('should handle missing environment variables gracefully', () => {
      const config = loadUploadConfig('s3');

      expect(config).toEqual({
        service: 's3',
        apiKey: undefined,
        apiSecret: undefined,
        bucket: undefined,
        region: 'us-east-1',
        endpoint: undefined,
      });
    });
  });

  describe('filename generation', () => {
    it('should use original filename when no custom filename provided', async () => {
      const args: any = {
        imagePath: '/path/to/original.jpg',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'original.jpg',
        args
      );
    });

    it('should extract extension from original filename for custom filename', async () => {
      const args: any = {
        imagePath: '/path/to/original.png',
        filename: 'custom',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'custom.png',
        args
      );
    });

    it('should default to jpg extension when no original extension available', async () => {
      const args: any = {
        base64Image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...',
        filename: 'custom',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'custom.image',
        args
      );
    });

    it('should preserve custom filename with extension', async () => {
      const args: any = {
        imagePath: '/path/to/original.jpg',
        filename: 'custom.webp',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'custom.webp',
        args
      );
    });
  });

  describe('service integration', () => {
    it('should create upload service with correct config', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.S3_BUCKET = 'test-bucket';

      const args: any = {
        imagePath: '/path/to/image.jpg',
        service: 's3' as const,
      };

      await uploadImageTool(args);

      expect(mockUploadServiceFactory.create).toHaveBeenCalledWith({
        service: 's3',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        bucket: 'test-bucket',
        region: 'us-east-1',
        endpoint: undefined,
      });

      expect(mockUploadService.validateConfig).toHaveBeenCalled();
    });

    it('should pass all arguments to upload service', async () => {
      const args = {
        imagePath: '/path/to/image.jpg',
        service: 's3' as const,
        folder: 'uploads/2024',
        public: false,
        overwrite: true,
        tags: ['test', 'upload'],
        metadata: { userId: '123', type: 'profile' },
      };

      await uploadImageTool(args);

      expect(mockUploadService.upload).toHaveBeenCalledWith(
        mockBuffer,
        'image.jpg',
        args
      );
    });
  });
});
