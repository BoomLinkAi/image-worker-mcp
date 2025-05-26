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

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'; // HeadObjectCommand is not directly used in tests after refactor
import { S3UploadService, ValidatedS3EnvConfig } from '../../src/services/s3';
import { UploadImageArgs } from '../../src/services/types';

// Get the mocked constructors
const MockedS3Client = vi.mocked(S3Client);
const MockedPutObjectCommand = vi.mocked(PutObjectCommand);

describe('S3UploadService', () => {
  let service: S3UploadService;
  let mockEnvConfig: ValidatedS3EnvConfig;
  let mockBuffer: Buffer;
  let mockArgs: UploadImageArgs;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSend = vi.fn();
    MockedS3Client.mockImplementation(() => ({
      send: mockSend,
    }) as any);
    
    mockEnvConfig = {
      UPLOAD_SERVICE: 's3',
      AWS_ACCESS_KEY_ID: 'test-access-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_BUCKET: 'test-bucket',
      S3_REGION: 'us-east-1',
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
    it('should create S3Client with mapped configuration from ENV-style input', () => {
      service = new S3UploadService(mockEnvConfig);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: mockEnvConfig.S3_REGION,
        credentials: {
          accessKeyId: mockEnvConfig.AWS_ACCESS_KEY_ID,
          secretAccessKey: mockEnvConfig.AWS_SECRET_ACCESS_KEY,
        },
      });
    });

    it('should include endpoint if provided in ENV-style config', () => {
      const envConfigWithEndpoint: ValidatedS3EnvConfig = {
        ...mockEnvConfig,
        S3_ENDPOINT: 'https://custom-s3.example.com',
      };
      
      service = new S3UploadService(envConfigWithEndpoint);
      
      expect(MockedS3Client).toHaveBeenCalledWith({
        region: envConfigWithEndpoint.S3_REGION,
        credentials: {
          accessKeyId: envConfigWithEndpoint.AWS_ACCESS_KEY_ID,
          secretAccessKey: envConfigWithEndpoint.AWS_SECRET_ACCESS_KEY,
        },
        endpoint: 'https://custom-s3.example.com',
      });
    });

    it('should use default region if S3_REGION not provided in ENV-style config', () => {
      const envConfigWithoutRegion: ValidatedS3EnvConfig = { 
        ...mockEnvConfig,
        S3_REGION: undefined, 
      };
      
      service = new S3UploadService(envConfigWithoutRegion);
      
      expect(MockedS3Client).toHaveBeenCalledWith(expect.objectContaining({
        region: 'us-east-1', 
        credentials: {
          accessKeyId: envConfigWithoutRegion.AWS_ACCESS_KEY_ID,
          secretAccessKey: envConfigWithoutRegion.AWS_SECRET_ACCESS_KEY,
        },
      }));
    });

    it('should create S3Client without credentials if AWS keys are not provided in ENV-style config', () => {
      const envConfigNoKeys: ValidatedS3EnvConfig = {
        UPLOAD_SERVICE: 's3',
        S3_BUCKET: 'test-bucket',
        S3_REGION: 'us-east-1',
      };
      service = new S3UploadService(envConfigNoKeys);
      expect(MockedS3Client.mock.calls.length).toBeGreaterThan(0);
      const calledWith = MockedS3Client.mock.calls[0][0];
      expect(calledWith).toBeDefined();
      if (calledWith) {
        expect(calledWith.region).toBe('us-east-1');
        expect(calledWith).not.toHaveProperty('credentials');
      }
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      service = new S3UploadService(mockEnvConfig);
    });

    it('should successfully upload file without folder', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = {
        ETag: '"test-etag"',
        VersionId: 'test-version-id',
      };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const result = await service.upload(mockBuffer, 'test.jpg', mockArgs);

      expect(result).toEqual({
        url: `https://${mockEnvConfig.S3_BUCKET}.s3.${mockEnvConfig.S3_REGION}.amazonaws.com/test.jpg`,
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 's3',
        metadata: {
          bucket: mockEnvConfig.S3_BUCKET,
          key: 'test.jpg',
          region: mockEnvConfig.S3_REGION,
          etag: '"test-etag"',
          versionId: 'test-version-id',
        },
      });
    });

    it('should successfully upload file with folder', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = {
        ETag: '"test-etag"',
        VersionId: 'test-version-id',
      };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const argsWithFolder = { ...mockArgs, folder: 'uploads/2024' };
      const result = await service.upload(mockBuffer, 'test.jpg', argsWithFolder);

      expect(result.url).toBe(`https://${mockEnvConfig.S3_BUCKET}.s3.${mockEnvConfig.S3_REGION}.amazonaws.com/uploads/2024/test.jpg`);
      expect(result.metadata?.key).toBe('uploads/2024/test.jpg');
    });

    it('should generate custom endpoint URL when S3_ENDPOINT is provided', async () => {
      const envConfigWithEndpoint: ValidatedS3EnvConfig = {
        ...mockEnvConfig,
        S3_ENDPOINT: 'https://minio.example.com',
      };
      service = new S3UploadService(envConfigWithEndpoint);

      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const result = await service.upload(mockBuffer, 'test.jpg', mockArgs);

      expect(result.url).toBe(`https://minio.example.com/${mockEnvConfig.S3_BUCKET}/test.jpg`);
    });

    it('should handle file extension correctly', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const result = await service.upload(mockBuffer, 'test.PNG', mockArgs);

      expect(result.format).toBe('png');
    });

    it('should default to jpg extension if none provided', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const result = await service.upload(mockBuffer, 'test', mockArgs);

      expect(result.format).toBe('jpg');
    });

    it('should set correct content type for different file types', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      await service.upload(mockBuffer, 'test.png', mockArgs);

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/png',
        })
      );
    });

    it('should set ACL based on public flag', async () => {
      const notFoundError1 = new Error('Not Found');
      notFoundError1.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError1);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: true });
      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ACL: 'public-read',
        })
      );

      MockedPutObjectCommand.mockClear();

      const notFoundError2 = new Error('Not Found');
      notFoundError2.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError2);
      mockSend.mockResolvedValueOnce(mockUploadResult);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: false });
      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ACL: 'private',
        })
      );
    });

    it('should include metadata in upload command', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const metadata = { userId: '123', uploadType: 'profile' };
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, metadata });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: metadata,
        })
      );
    });

    it('should include tags in upload command', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      const tags = ['user-upload', 'profile-pic'];
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, tags });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Tagging: 'tag=user-upload&tag=profile-pic',
        })
      );
    });

    it('should not include tagging if no tags provided', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const mockUploadResult = { ETag: '"test-etag"' };
      mockSend.mockResolvedValueOnce(mockUploadResult);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, tags: undefined });

      expect(MockedPutObjectCommand).toHaveBeenCalledWith(
        expect.not.objectContaining({
          Tagging: expect.anything(),
        })
      );
    });

    describe('overwrite protection', () => {
      it('should check for existing file when overwrite is false', async () => {
        const notFoundError = new Error('Not Found');
        notFoundError.name = 'NotFound';
        mockSend.mockRejectedValueOnce(notFoundError);

        const mockUploadResult = { ETag: '"test-etag"' };
        mockSend.mockResolvedValueOnce(mockUploadResult);

        await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false });

        expect(mockSend).toHaveBeenCalledTimes(2); 
      });

      it('should throw error if file exists and overwrite is false', async () => {
        mockSend.mockResolvedValueOnce({ ContentLength: 1000 }); // Simulate file exists

        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow(McpError);

        // Need to reset the mock for the second call if it's part of the same test logic
        // or ensure the test is structured to only make one call that's expected to throw.
        // For this test, we'll assume the first call is what we're testing for the throw.
        // If testing the message specifically, ensure the mock is set up for that call.
        mockSend.mockReset(); // Reset for the specific message check
        mockSend.mockResolvedValueOnce({ ContentLength: 1000 }); 
        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow('File test.jpg already exists. Set overwrite=true to replace it.');
      });

      it('should skip existence check when overwrite is true', async () => {
        const mockUploadResult = { ETag: '"test-etag"' };
        mockSend.mockResolvedValue(mockUploadResult); // Only one send call expected

        await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: true });

        expect(mockSend).toHaveBeenCalledTimes(1); 
      });

      it('should handle NoSuchKey error as file not found', async () => {
        const noSuchKeyError = new Error('No Such Key');
        noSuchKeyError.name = 'NoSuchKey';
        mockSend.mockRejectedValueOnce(noSuchKeyError);

        const mockUploadResult = { ETag: '"test-etag"' };
        mockSend.mockResolvedValueOnce(mockUploadResult);

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
        // For this test, the error should originate from the HeadObjectCommand or PutObjectCommand
        // If it's from HeadObject:
        mockSend.mockRejectedValueOnce(mcpError); 

        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow(mcpError);
      });
    });
  });

  describe('getContentType', () => {
    beforeEach(() => {
      service = new S3UploadService(mockEnvConfig);
    });

    it('should return correct MIME types for supported formats', () => {
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
      service = new S3UploadService(mockEnvConfig);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe(`https://${mockEnvConfig.S3_BUCKET}.s3.${mockEnvConfig.S3_REGION}.amazonaws.com/test/image.jpg`);
    });

    it('should generate custom endpoint URL when S3_ENDPOINT is provided', () => {
      const envConfigWithEndpoint: ValidatedS3EnvConfig = {
        ...mockEnvConfig,
        S3_ENDPOINT: 'https://minio.example.com',
      };
      service = new S3UploadService(envConfigWithEndpoint);
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe(`https://minio.example.com/${mockEnvConfig.S3_BUCKET}/test/image.jpg`);
    });
  });
});
