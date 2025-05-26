import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock AWS SDK with factory function
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
    PutObjectCommand: vi.fn().mockImplementation((params) => ({ params })),
    HeadObjectCommand: vi.fn().mockImplementation((params) => ({ params })),
  };
});

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { S3UploadService } from '../../src/services/s3';
import { UploadServiceConfig, UploadImageArgs } from '../../src/services/types';

// Get the mocked constructors
const MockedS3Client = vi.mocked(S3Client);
const MockedPutObjectCommand = vi.mocked(PutObjectCommand);

describe('S3UploadService', () => {
  let service: S3UploadService;
  let mockConfig: UploadServiceConfig;
  let mockBuffer: Buffer;
  let mockArgs: UploadImageArgs;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a fresh mock for the send method
    mockSend = vi.fn();
    MockedS3Client.mockImplementation(() => ({
      send: mockSend,
    }) as any);
    
    mockConfig = {
      service: 's3',
      apiKey: 'test-access-key',
      apiSecret: 'test-secret-key',
      bucket: 'test-bucket',
      region: 'us-east-1',
    };

    mockBuffer = Buffer.from('test image data');
    
    mockArgs = {
      public: true,
      overwrite: false,
      metadata: { userId: '123' },
      tags: ['test', 'image'],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create S3Client with correct configuration', () => {
      service = new S3UploadService(mockConfig);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      });
    });

    it('should include endpoint if provided', () => {
      const configWithEndpoint = {
        ...mockConfig,
        endpoint: 'https://custom-s3.example.com',
      };
      
      service = new S3UploadService(configWithEndpoint);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
        endpoint: 'https://custom-s3.example.com',
      });
    });

    it('should use default region if not provided', () => {
      const configWithoutRegion = { ...mockConfig };
      delete configWithoutRegion.region;
      
      service = new S3UploadService(configWithoutRegion);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      });
    });
  });

  describe('validateConfig', () => {
    it('should pass validation with valid config', () => {
      service = new S3UploadService(mockConfig);
      expect(() => service.validateConfig()).not.toThrow();
    });

    it('should throw error if apiKey is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.apiKey;
      
      service = new S3UploadService(invalidConfig);
      
      expect(() => service.validateConfig()).toThrow(McpError);
      expect(() => service.validateConfig()).toThrow(
        'S3 upload service requires apiKey, apiSecret, and bucket configuration'
      );
    });

    it('should throw error if apiSecret is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.apiSecret;
      
      service = new S3UploadService(invalidConfig);
      
      expect(() => service.validateConfig()).toThrow(McpError);
    });

    it('should throw error if bucket is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.bucket;
      
      service = new S3UploadService(invalidConfig);
      
      expect(() => service.validateConfig()).toThrow(McpError);
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      service = new S3UploadService(mockConfig);
    });

    it('should successfully upload file without folder', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      // Mock successful upload
      const mockResult = {
        ETag: '"test-etag"',
        VersionId: 'test-version-id',
      };
      mockSend.mockResolvedValueOnce(mockResult);

      const result = await service.upload(mockBuffer, 'test.jpg', mockArgs);

      expect(result).toEqual({
        url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 's3',
        metadata: {
          bucket: 'test-bucket',
          key: 'test.jpg',
          region: 'us-east-1',
          etag: '"test-etag"',
          versionId: 'test-version-id',
        },
      });
    });

    it('should successfully upload file with folder', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      // Mock successful upload
      const mockResult = {
        ETag: '"test-etag"',
        VersionId: 'test-version-id',
      };
      mockSend.mockResolvedValueOnce(mockResult);

      const argsWithFolder = { ...mockArgs, folder: 'uploads/2024' };
      const result = await service.upload(mockBuffer, 'test.jpg', argsWithFolder);

      expect(result.url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/uploads/2024/test.jpg');
      expect(result.metadata?.key).toBe('uploads/2024/test.jpg');
    });

    it('should generate custom endpoint URL when endpoint is provided', async () => {
      const configWithEndpoint = {
        ...mockConfig,
        endpoint: 'https://minio.example.com',
      };
      service = new S3UploadService(configWithEndpoint);

      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const result = await service.upload(mockBuffer, 'test.jpg', mockArgs);

      expect(result.url).toBe('https://minio.example.com/test-bucket/test.jpg');
    });

    it('should handle file extension correctly', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const result = await service.upload(mockBuffer, 'test.PNG', mockArgs);

      expect(result.format).toBe('png');
    });

    it('should default to jpg extension if none provided', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const result = await service.upload(mockBuffer, 'test', mockArgs);

      expect(result.format).toBe('jpg');
    });

    it('should set correct content type for different file types', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      await service.upload(mockBuffer, 'test.png', mockArgs);

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/png',
        })
      );
    });

    it('should set ACL based on public flag', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist) - for first upload
      const notFoundError1 = new Error('Not Found');
      notFoundError1.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError1);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      // Test public upload
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: true });
      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ACL: 'public-read',
        })
      );

      MockedPutObjectCommand.mockClear();

      // Mock HeadObject to throw NotFound (file doesn't exist) - for second upload
      const notFoundError2 = new Error('Not Found');
      notFoundError2.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError2);
      mockSend.mockResolvedValueOnce(mockResult);

      // Test private upload
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: false });
      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ACL: 'private',
        })
      );
    });

    it('should include metadata in upload command', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const metadata = { userId: '123', uploadType: 'profile' };
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, metadata });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: metadata,
        })
      );
    });

    it('should include tags in upload command', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const tags = ['user-upload', 'profile-pic'];
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, tags });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Tagging: 'tag=user-upload&tag=profile-pic',
        })
      );
    });

    it('should not include tagging if no tags provided', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, tags: undefined });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.not.objectContaining({
          Tagging: expect.anything(),
        })
      );
    });

    describe('overwrite protection', () => {
      it('should check for existing file when overwrite is false', async () => {
        // Mock HeadObject to throw NotFound (file doesn't exist)
        const notFoundError = new Error('Not Found');
        notFoundError.name = 'NotFound';
        mockSend.mockRejectedValueOnce(notFoundError);

        // Mock successful upload
        const mockResult = { ETag: '"test-etag"' };
        mockSend.mockResolvedValueOnce(mockResult);

        await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false });

        expect(mockSend).toHaveBeenCalledTimes(2); // HeadObject + PutObject
      });

      it('should throw error if file exists and overwrite is false', async () => {
        // Mock HeadObject to succeed (file exists)
        mockSend.mockResolvedValueOnce({ ContentLength: 1000 });

        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow(McpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow('File test.jpg already exists. Set overwrite=true to replace it.');
      });

      it('should skip existence check when overwrite is true', async () => {
        const mockResult = { ETag: '"test-etag"' };
        mockSend.mockResolvedValue(mockResult);

        await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: true });

        expect(mockSend).toHaveBeenCalledTimes(1); // Only PutObject
      });

      it('should handle NoSuchKey error as file not found', async () => {
        // Mock HeadObject to throw NoSuchKey (file doesn't exist)
        const noSuchKeyError = new Error('No Such Key');
        noSuchKeyError.name = 'NoSuchKey';
        mockSend.mockRejectedValueOnce(noSuchKeyError);

        // Mock successful upload
        const mockResult = { ETag: '"test-etag"' };
        mockSend.mockResolvedValueOnce(mockResult);

        const result = await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false });

        expect(result).toBeDefined();
        expect(mockSend).toHaveBeenCalledTimes(2);
      });
    });

    describe('error handling', () => {
      it('should wrap S3 errors in McpError', async () => {
        const s3Error = new Error('S3 Service Error');
        mockSend.mockRejectedValue(s3Error);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow(McpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow('S3 upload failed: S3 Service Error');
      });

      it('should preserve McpError instances', async () => {
        const mcpError = new McpError(ErrorCode.InvalidParams, 'Custom MCP error');
        mockSend.mockRejectedValue(mcpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow(mcpError);
      });
    });
  });

  describe('getContentType', () => {
    beforeEach(() => {
      service = new S3UploadService(mockConfig);
    });

    it('should return correct MIME types for supported formats', () => {
      // Access private method for testing
      const getContentType = (service as any).getContentType.bind(service);

      expect(getContentType('jpg')).toBe('image/jpeg');
      expect(getContentType('jpeg')).toBe('image/jpeg');
      expect(getContentType('png')).toBe('image/png');
      expect(getContentType('gif')).toBe('image/gif');
      expect(getContentType('webp')).toBe('image/webp');
      expect(getContentType('avif')).toBe('image/avif');
      expect(getContentType('tiff')).toBe('image/tiff');
      expect(getContentType('heic')).toBe('image/heic');
      expect(getContentType('heif')).toBe('image/heif');
    });

    it('should return default MIME type for unknown extensions', () => {
      const getContentType = (service as any).getContentType.bind(service);
      expect(getContentType('unknown')).toBe('application/octet-stream');
    });
  });

  describe('generateUrl', () => {
    it('should generate standard AWS S3 URL', () => {
      service = new S3UploadService(mockConfig);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/test/image.jpg');
    });

    it('should generate custom endpoint URL', () => {
      const configWithEndpoint = {
        ...mockConfig,
        endpoint: 'https://minio.example.com',
      };
      service = new S3UploadService(configWithEndpoint);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe('https://minio.example.com/test-bucket/test/image.jpg');
    });
  });
});
