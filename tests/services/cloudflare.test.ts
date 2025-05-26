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
import { CloudflareUploadService } from '../../src/services/cloudflare';
import { UploadServiceConfig, UploadImageArgs } from '../../src/services/types';

// Get the mocked constructors
const MockedS3Client = vi.mocked(S3Client);
const MockedPutObjectCommand = vi.mocked(PutObjectCommand);

describe('CloudflareUploadService', () => {
  let service: CloudflareUploadService;
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
      service: 'cloudflare',
      apiKey: 'test-access-key',
      apiSecret: 'test-secret-key',
      bucket: 'test-bucket',
      region: 'auto',
      endpoint: 'https://test-account.r2.cloudflarestorage.com',
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
    it('should create S3Client with correct Cloudflare R2 configuration', () => {
      service = new CloudflareUploadService(mockConfig);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: 'auto',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
        forcePathStyle: true, // Required for R2
      });
    });

    it('should use default region if not provided', () => {
      const configWithoutRegion = { ...mockConfig };
      delete configWithoutRegion.region;
      
      service = new CloudflareUploadService(configWithoutRegion);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: 'auto',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
        forcePathStyle: true,
      });
    });

    it('should throw error if endpoint is missing', () => {
      const configWithoutEndpoint = { ...mockConfig };
      delete configWithoutEndpoint.endpoint;
      
      expect(() => new CloudflareUploadService(configWithoutEndpoint)).toThrow(McpError);
      expect(() => new CloudflareUploadService(configWithoutEndpoint)).toThrow(
        'Cloudflare R2 requires an endpoint URL'
      );
    });
  });

  describe('validateConfig', () => {
    it('should pass validation with valid config', () => {
      service = new CloudflareUploadService(mockConfig);
      expect(() => service.validateConfig()).not.toThrow();
    });

    it('should throw error if apiKey is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.apiKey;
      
      service = new CloudflareUploadService(invalidConfig);
      
      expect(() => service.validateConfig()).toThrow(McpError);
      expect(() => service.validateConfig()).toThrow(
        'Cloudflare R2 upload service requires apiKey, apiSecret, bucket, and endpoint configuration'
      );
    });

    it('should throw error if apiSecret is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.apiSecret;
      
      service = new CloudflareUploadService(invalidConfig);
      
      expect(() => service.validateConfig()).toThrow(McpError);
    });

    it('should throw error if bucket is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.bucket;
      
      service = new CloudflareUploadService(invalidConfig);
      
      expect(() => service.validateConfig()).toThrow(McpError);
    });

    it('should throw error if endpoint is missing', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.endpoint;
      
      expect(() => new CloudflareUploadService(invalidConfig)).toThrow(McpError);
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      service = new CloudflareUploadService(mockConfig);
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
        url: 'https://test-account.r2.cloudflarestorage.com/test-bucket/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 'cloudflare',
        metadata: {
          bucket: 'test-bucket',
          key: 'test.jpg',
          endpoint: 'https://test-account.r2.cloudflarestorage.com',
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

      expect(result.url).toBe('https://test-account.r2.cloudflarestorage.com/test-bucket/uploads/2024/test.jpg');
      expect(result.metadata?.key).toBe('uploads/2024/test.jpg');
    });

    it('should generate custom domain URL when baseUrl is provided', async () => {
      const configWithBaseUrl = {
        ...mockConfig,
        baseUrl: 'https://cdn.example.com',
      };
      service = new CloudflareUploadService(configWithBaseUrl);

      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const result = await service.upload(mockBuffer, 'test.jpg', mockArgs);

      expect(result.url).toBe('https://cdn.example.com/test.jpg');
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

    it('should not include ACL in upload command (R2 specific)', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: true });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.not.objectContaining({
          ACL: expect.anything(),
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

    it('should not include tags in upload command (R2 limitation)', async () => {
      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const tags = ['user-upload', 'profile-pic'];
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, tags });

      // R2 doesn't support tagging in the same way as S3
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
      it('should wrap R2 errors in McpError', async () => {
        const r2Error = new Error('R2 Service Error');
        mockSend.mockRejectedValue(r2Error);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow(McpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow('Cloudflare R2 upload failed: R2 Service Error');
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
      service = new CloudflareUploadService(mockConfig);
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
    it('should generate R2 endpoint URL by default', () => {
      service = new CloudflareUploadService(mockConfig);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe('https://test-account.r2.cloudflarestorage.com/test-bucket/test/image.jpg');
    });

    it('should generate custom domain URL when baseUrl is provided', () => {
      const configWithBaseUrl = {
        ...mockConfig,
        baseUrl: 'https://cdn.example.com',
      };
      service = new CloudflareUploadService(configWithBaseUrl);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe('https://cdn.example.com/test/image.jpg');
    });

    it('should handle keys without folders', () => {
      service = new CloudflareUploadService(mockConfig);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('image.jpg');
      expect(url).toBe('https://test-account.r2.cloudflarestorage.com/test-bucket/image.jpg');
    });
  });

  describe('Cloudflare R2 specific features', () => {
    beforeEach(() => {
      service = new CloudflareUploadService(mockConfig);
    });

    it('should always use forcePathStyle for R2 compatibility', () => {
      expect(MockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          forcePathStyle: true,
        })
      );
    });

    it('should use auto region by default for R2', () => {
      const configWithoutRegion = { ...mockConfig };
      delete configWithoutRegion.region;
      
      service = new CloudflareUploadService(configWithoutRegion);
      
      expect(MockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'auto',
        })
      );
    });

    it('should require endpoint in constructor', () => {
      const configWithoutEndpoint = { ...mockConfig };
      delete configWithoutEndpoint.endpoint;
      
      expect(() => new CloudflareUploadService(configWithoutEndpoint)).toThrow(
        'Cloudflare R2 requires an endpoint URL'
      );
    });
  });
});
