import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
    PutObjectCommand: vi.fn().mockImplementation((params) => ({ params })),
    HeadObjectCommand: vi.fn().mockImplementation((params) => ({ params })),
  };
});

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudflareEnvConfigSchema, CloudflareUploadService, ValidatedCloudflareEnvConfig } from '../../src/services/cloudflare';
import { UploadImageArgs } from '../../src/services/types';

// Get the mocked constructors
const MockedS3Client = vi.mocked(S3Client);
const MockedPutObjectCommand = vi.mocked(PutObjectCommand);

describe('CloudflareUploadService', () => {
  let service: CloudflareUploadService;
  let mockValidatedConfig: ValidatedCloudflareEnvConfig;
  let mockBuffer: Buffer;
  let mockArgs: UploadImageArgs;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSend = vi.fn();
    MockedS3Client.mockImplementation(() => ({
      send: mockSend,
    }) as any);
    
    mockValidatedConfig = CloudflareEnvConfigSchema.parse({
      CLOUDFLARE_R2_BUCKET: 'test-bucket',
      CLOUDFLARE_R2_ACCESS_KEY_ID: 'test-access-key',
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'test-secret-key',
      CLOUDFLARE_R2_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
      CLOUDFLARE_R2_REGION: 'auto',
    });

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
      service = new CloudflareUploadService(mockValidatedConfig);
      
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
      const configWithoutRegion = { ...mockValidatedConfig };
      delete configWithoutRegion.CLOUDFLARE_R2_REGION;
      
      service = new CloudflareUploadService(configWithoutRegion);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: 'auto', // Defaulted by the service constructor
        credentials: {
          accessKeyId: mockValidatedConfig.CLOUDFLARE_R2_ACCESS_KEY_ID,
          secretAccessKey: mockValidatedConfig.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
        endpoint: mockValidatedConfig.CLOUDFLARE_R2_ENDPOINT,
        forcePathStyle: true,
      });
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      service = new CloudflareUploadService(mockValidatedConfig);
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
        url: `https://test-account.r2.cloudflarestorage.com/${mockValidatedConfig.CLOUDFLARE_R2_BUCKET}/test.jpg`,
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 'cloudflare',
        metadata: {
          bucket: mockValidatedConfig.CLOUDFLARE_R2_BUCKET,
          key: 'test.jpg',
          endpoint: mockValidatedConfig.CLOUDFLARE_R2_ENDPOINT,
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

      expect(result.url).toBe(`${mockValidatedConfig.CLOUDFLARE_R2_ENDPOINT}/${mockValidatedConfig.CLOUDFLARE_R2_BUCKET}/uploads/2024/test.jpg`);
      expect(result.metadata?.key).toBe('uploads/2024/test.jpg');
    });

    it('should generate custom domain URL when baseUrl is provided', async () => {
      const tempService = new CloudflareUploadService(mockValidatedConfig);
      (tempService as any).config.baseUrl = 'https://cdn.example.com';


      // Mock HeadObject to throw NotFound (file doesn't exist)
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockResult);

      const result = await tempService.upload(mockBuffer, 'test.jpg', mockArgs);

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
      service = new CloudflareUploadService(mockValidatedConfig);
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
      service = new CloudflareUploadService(mockValidatedConfig);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe(`${mockValidatedConfig.CLOUDFLARE_R2_ENDPOINT}/${mockValidatedConfig.CLOUDFLARE_R2_BUCKET}/test/image.jpg`);
    });

    it('should generate custom domain URL when baseUrl is provided', () => {
      // Similar to the upload test, this requires setting internal config.baseUrl
      const serviceWithBaseUrl = new CloudflareUploadService(mockValidatedConfig);
      (serviceWithBaseUrl as any).config.baseUrl = 'https://cdn.example.com';
      const generateUrl = (serviceWithBaseUrl as any).generateUrl.bind(serviceWithBaseUrl);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe('https://cdn.example.com/test/image.jpg');
    });

    it('should handle keys without folders', () => {
      service = new CloudflareUploadService(mockValidatedConfig);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('image.jpg');
      expect(url).toBe(`${mockValidatedConfig.CLOUDFLARE_R2_ENDPOINT}/${mockValidatedConfig.CLOUDFLARE_R2_BUCKET}/image.jpg`);
    });
  });

  describe('Cloudflare R2 specific features', () => {
    beforeEach(() => {
      service = new CloudflareUploadService(mockValidatedConfig);
    });

    it('should always use forcePathStyle for R2 compatibility', () => {
      expect(MockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          forcePathStyle: true,
        })
      );
    });

    it('should use auto region by default for R2', () => {
      const envConfigWithoutRegion = { ...mockValidatedConfig };
      delete envConfigWithoutRegion.CLOUDFLARE_R2_REGION;
      
      service = new CloudflareUploadService(envConfigWithoutRegion);
      
      expect(MockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'auto',
        })
      );
    });
  });
});
