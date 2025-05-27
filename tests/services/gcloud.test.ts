import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock Google Cloud Storage
vi.mock('@google-cloud/storage', () => {
  const mockFile = {
    save: vi.fn(),
    exists: vi.fn(),
  };
  
  const mockBucket = {
    file: vi.fn().mockReturnValue(mockFile),
  };
  
  const mockStorage = {
    bucket: vi.fn().mockReturnValue(mockBucket),
  };
  
  return {
    Storage: vi.fn().mockImplementation(() => mockStorage),
  };
});

import { Storage } from '@google-cloud/storage';
import { GCloudEnvConfigSchema, GCloudUploadService, ValidatedGCloudEnvConfig } from '../../src/services/gcloud';
import { UploadImageArgs } from '../../src/services/types';

// Get the mocked constructors
const MockedStorage = vi.mocked(Storage);

describe('GCloudUploadService', () => {
  let service: GCloudUploadService;
  let mockValidatedConfig: ValidatedGCloudEnvConfig;
  let mockBuffer: Buffer;
  let mockArgs: UploadImageArgs;
  let mockStorage: any;
  let mockBucket: any;
  let mockFile: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockFile = {
      save: vi.fn(),
      exists: vi.fn(),
    };
    
    mockBucket = {
      file: vi.fn().mockReturnValue(mockFile),
    };
    
    mockStorage = {
      bucket: vi.fn().mockReturnValue(mockBucket),
    };
    
    MockedStorage.mockImplementation(() => mockStorage);
    
    mockValidatedConfig = GCloudEnvConfigSchema.parse({
      GCLOUD_BUCKET: 'test-bucket',
      GCLOUD_PROJECT_ID: 'test-project-id',
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
    it('should create Storage client with correct configuration', () => {
      service = new GCloudUploadService(mockValidatedConfig);
      
      expect(MockedStorage).toHaveBeenCalledWith({
        projectId: 'test-project-id',
      });
      
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
    });

    it('should include keyFilename if GCLOUD_CREDENTIALS_PATH is provided', () => {
      const configWithCredentials = GCloudEnvConfigSchema.parse({
        GCLOUD_BUCKET: 'test-bucket',
        GCLOUD_PROJECT_ID: 'test-project-id',
        GCLOUD_CREDENTIALS_PATH: '/path/to/credentials.json',
      });
      
      service = new GCloudUploadService(configWithCredentials);
      
      expect(MockedStorage).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        keyFilename: '/path/to/credentials.json',
      });
    });

    it('should not include keyFilename if GCLOUD_CREDENTIALS_PATH is not provided', () => {
      service = new GCloudUploadService(mockValidatedConfig);
      
      expect(MockedStorage).toHaveBeenCalledWith({
        projectId: 'test-project-id',
      });
      
      // Ensure keyFilename is not in the call
      const calledWith = MockedStorage.mock.calls[0][0];
      expect(calledWith).not.toHaveProperty('keyFilename');
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      service = new GCloudUploadService(mockValidatedConfig);
    });

    it('should successfully upload file without folder', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      const result = await service.upload(mockBuffer, 'test.jpg', mockArgs);

      expect(mockBucket.file).toHaveBeenCalledWith('test.jpg');
      expect(mockFile.save).toHaveBeenCalledWith(mockBuffer, {
        contentType: 'image/jpeg',
        metadata: { userId: '123' },
        public: true,
      });

      expect(result).toEqual({
        url: 'https://storage.googleapis.com/test-bucket/test.jpg',
        filename: 'test.jpg',
        size: mockBuffer.length,
        format: 'jpg',
        service: 'gcloud',
        metadata: {
          bucket: 'test-bucket',
          key: 'test.jpg',
          projectId: 'test-project-id',
        },
      });
    });

    it('should successfully upload file with folder', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      const argsWithFolder = { ...mockArgs, folder: 'uploads/2024' };
      const result = await service.upload(mockBuffer, 'test.jpg', argsWithFolder);

      expect(mockBucket.file).toHaveBeenCalledWith('uploads/2024/test.jpg');
      expect(result.url).toBe('https://storage.googleapis.com/test-bucket/uploads/2024/test.jpg');
      expect(result.metadata?.key).toBe('uploads/2024/test.jpg');
    });

    it('should handle file extension correctly', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      const result = await service.upload(mockBuffer, 'test.PNG', mockArgs);

      expect(result.format).toBe('png');
    });

    it('should default to jpg extension if none provided', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      const result = await service.upload(mockBuffer, 'test', mockArgs);

      expect(result.format).toBe('jpg');
    });

    it('should set correct content type for different file types', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      await service.upload(mockBuffer, 'test.png', mockArgs);

      expect(mockFile.save).toHaveBeenCalledWith(
        mockBuffer,
        expect.objectContaining({
          contentType: 'image/png',
        })
      );
    });

    it('should set public flag correctly', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: true });
      expect(mockFile.save).toHaveBeenCalledWith(
        mockBuffer,
        expect.objectContaining({
          public: true,
        })
      );

      mockFile.save.mockClear();
      mockFile.exists.mockResolvedValue([false]);

      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, public: false });
      expect(mockFile.save).toHaveBeenCalledWith(
        mockBuffer,
        expect.objectContaining({
          public: false,
        })
      );
    });

    it('should include metadata in upload command', async () => {
      // Mock file doesn't exist
      mockFile.exists.mockResolvedValue([false]);
      
      // Mock successful upload
      mockFile.save.mockResolvedValue(undefined);

      const metadata = { userId: '123', uploadType: 'profile' };
      await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, metadata });

      expect(mockFile.save).toHaveBeenCalledWith(
        mockBuffer,
        expect.objectContaining({
          metadata: metadata,
        })
      );
    });

    describe('overwrite protection', () => {
      it('should check for existing file when overwrite is false', async () => {
        // Mock file doesn't exist
        mockFile.exists.mockResolvedValue([false]);
        
        // Mock successful upload
        mockFile.save.mockResolvedValue(undefined);

        await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false });

        expect(mockFile.exists).toHaveBeenCalled();
        expect(mockFile.save).toHaveBeenCalled();
      });

      it('should throw error if file exists and overwrite is false', async () => {
        // Mock file exists
        mockFile.exists.mockResolvedValue([true]);

        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow(McpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: false })
        ).rejects.toThrow('File test.jpg already exists. Set overwrite=true to replace it.');
      });

      it('should skip existence check when overwrite is true', async () => {
        // Mock successful upload
        mockFile.save.mockResolvedValue(undefined);

        await service.upload(mockBuffer, 'test.jpg', { ...mockArgs, overwrite: true });

        expect(mockFile.exists).not.toHaveBeenCalled();
        expect(mockFile.save).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should wrap GCloud errors in McpError', async () => {
        const gcloudError = new Error('GCloud Service Error');
        mockFile.exists.mockRejectedValue(gcloudError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow(McpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow('GCloud upload failed: GCloud Service Error');
      });

      it('should preserve McpError instances', async () => {
        const mcpError = new McpError(ErrorCode.InvalidParams, 'Custom MCP error');
        mockFile.exists.mockRejectedValue(mcpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow(mcpError);
      });

      it('should handle upload errors', async () => {
        // Mock file doesn't exist
        mockFile.exists.mockResolvedValue([false]);
        
        // Mock upload failure
        const uploadError = new Error('Upload failed');
        mockFile.save.mockRejectedValue(uploadError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow(McpError);

        await expect(
          service.upload(mockBuffer, 'test.jpg', mockArgs)
        ).rejects.toThrow('GCloud upload failed: Upload failed');
      });
    });
  });

  describe('getContentType', () => {
    beforeEach(() => {
      service = new GCloudUploadService(mockValidatedConfig);
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
    beforeEach(() => {
      service = new GCloudUploadService(mockValidatedConfig);
    });

    it('should generate Google Cloud Storage URL', () => {
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('test/image.jpg');
      expect(url).toBe('https://storage.googleapis.com/test-bucket/test/image.jpg');
    });

    it('should handle keys without folders', () => {
      const generateUrl = (service as any).generateUrl.bind(service);

      const url = generateUrl('image.jpg');
      expect(url).toBe('https://storage.googleapis.com/test-bucket/image.jpg');
    });
  });

  describe('GCloud specific features', () => {
    it('should use Google Cloud Storage client', () => {
      service = new GCloudUploadService(mockValidatedConfig);
      
      expect(MockedStorage).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project-id',
        })
      );
    });

    it('should support custom credentials path', () => {
      const configWithCredentials = GCloudEnvConfigSchema.parse({
        GCLOUD_BUCKET: 'test-bucket',
        GCLOUD_PROJECT_ID: 'test-project-id',
        GCLOUD_CREDENTIALS_PATH: '/custom/path/credentials.json',
      });
      
      service = new GCloudUploadService(configWithCredentials);
      
      expect(MockedStorage).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        keyFilename: '/custom/path/credentials.json',
      });
    });

    it('should use default authentication when no credentials path provided', () => {
      service = new GCloudUploadService(mockValidatedConfig);
      
      const calledWith = MockedStorage.mock.calls[0][0];
      expect(calledWith).toEqual({
        projectId: 'test-project-id',
      });
      expect(calledWith).not.toHaveProperty('keyFilename');
    });
  });

  describe('GCloudEnvConfigSchema validation', () => {
    it('should require GCLOUD_BUCKET', () => {
      expect(() => {
        GCloudEnvConfigSchema.parse({
          GCLOUD_PROJECT_ID: 'test-project',
        });
      }).toThrow();
    });

    it('should require GCLOUD_PROJECT_ID', () => {
      expect(() => {
        GCloudEnvConfigSchema.parse({
          GCLOUD_BUCKET: 'test-bucket',
        });
      }).toThrow();
    });

    it('should accept valid configuration', () => {
      const config = GCloudEnvConfigSchema.parse({
        GCLOUD_BUCKET: 'test-bucket',
        GCLOUD_PROJECT_ID: 'test-project',
      });

      expect(config).toEqual({
        UPLOAD_SERVICE: 'gcloud',
        GCLOUD_BUCKET: 'test-bucket',
        GCLOUD_PROJECT_ID: 'test-project',
      });
    });

    it('should accept configuration with credentials path', () => {
      const config = GCloudEnvConfigSchema.parse({
        GCLOUD_BUCKET: 'test-bucket',
        GCLOUD_PROJECT_ID: 'test-project',
        GCLOUD_CREDENTIALS_PATH: '/path/to/credentials.json',
      });

      expect(config).toEqual({
        UPLOAD_SERVICE: 'gcloud',
        GCLOUD_BUCKET: 'test-bucket',
        GCLOUD_PROJECT_ID: 'test-project',
        GCLOUD_CREDENTIALS_PATH: '/path/to/credentials.json',
      });
    });
  });
});