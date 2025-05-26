import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { BaseUploadService, UploadServiceConfig, UploadResult, UploadImageArgs } from './types';

// Cloudflare R2 upload service implementation
export class CloudflareUploadService extends BaseUploadService {
  private s3Client: S3Client;

  constructor(config: UploadServiceConfig) {
    super(config);
    
    if (!config.endpoint) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cloudflare R2 requires an endpoint URL'
      );
    }

    this.s3Client = new S3Client({
      region: this.config.region || 'auto',
      credentials: {
        accessKeyId: this.config.apiKey!,
        secretAccessKey: this.config.apiSecret!,
      },
      endpoint: this.config.endpoint,
      forcePathStyle: true, // Required for R2
    });
  }

  validateConfig(): void {
    if (!this.config.apiKey || !this.config.apiSecret || !this.config.bucket || !this.config.endpoint) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cloudflare R2 upload service requires apiKey, apiSecret, bucket, and endpoint configuration'
      );
    }
  }

  async upload(buffer: Buffer, filename: string, args: UploadImageArgs): Promise<UploadResult> {
    try {
      const key = args.folder ? `${args.folder}/${filename}` : filename;
      const parts = filename.split('.');
      const fileExtension = parts.length > 1 ? parts.pop()?.toLowerCase() || 'jpg' : 'jpg';
      const contentType = this.getContentType(fileExtension);

      // Check if file exists and handle overwrite
      if (!args.overwrite) {
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: this.config.bucket!,
            Key: key,
          });
          await this.s3Client.send(headCommand);
          throw new McpError(
            ErrorCode.InvalidParams,
            `File ${key} already exists. Set overwrite=true to replace it.`
          );
        } catch (error: any) {
          // If error is NotFound, file doesn't exist and we can proceed
          if (error.name !== 'NotFound' && error.name !== 'NoSuchKey') {
            throw error;
          }
        }
      }

      const putCommand = new PutObjectCommand({
        Bucket: this.config.bucket!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: args.metadata || {},
        // Note: R2 doesn't support ACL in the same way as S3
        // Public access is controlled via bucket settings or custom domains
      });

      const result = await this.s3Client.send(putCommand);
      
      // Generate URL based on configuration
      const url = this.generateUrl(key);

      return {
        url,
        filename,
        size: buffer.length,
        format: fileExtension,
        service: 'cloudflare',
        metadata: {
          bucket: this.config.bucket,
          key,
          endpoint: this.config.endpoint,
          etag: result.ETag,
          versionId: result.VersionId,
        },
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Cloudflare R2 upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getContentType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'avif': 'image/avif',
      'tiff': 'image/tiff',
      'heic': 'image/heic',
      'heif': 'image/heif',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  private generateUrl(key: string): string {
    // R2 URL generation options:
    // 1. Custom domain if baseUrl is provided
    if (this.config.baseUrl) {
      return `${this.config.baseUrl}/${key}`;
    }
    
    // 2. Public R2 URL (if bucket has public access configured)
    // Format: https://pub-<bucket-id>.r2.dev/<key>
    // Note: This requires the bucket to be configured for public access
    
    // 3. Direct endpoint URL (for private access or when using presigned URLs)
    return `${this.config.endpoint}/${this.config.bucket}/${key}`;
  }
}