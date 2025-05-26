import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BaseUploadService, UploadServiceConfig, UploadResult, UploadImageArgs } from './types';

export const S3EnvConfigSchema = z.object({
  UPLOAD_SERVICE: z.literal('s3').optional(),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required and cannot be empty'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().url('S3_ENDPOINT must be a valid URL if provided').optional(),
}).refine(data => (data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY) || (!data.AWS_ACCESS_KEY_ID && !data.AWS_SECRET_ACCESS_KEY), {
  message: 'If AWS_ACCESS_KEY_ID is provided, AWS_SECRET_ACCESS_KEY must also be provided, and vice-versa.',
  path: ['AWS_ACCESS_KEY_ID'],
});

export type ValidatedS3EnvConfig = z.infer<typeof S3EnvConfigSchema>;

export class S3UploadService extends BaseUploadService {
  private s3Client: S3Client;

  constructor(validatedEnvConfig: ValidatedS3EnvConfig) {
    const serviceConfig: UploadServiceConfig = {
      service: 's3', // Explicitly set
      bucket: validatedEnvConfig.S3_BUCKET,
      apiKey: validatedEnvConfig.AWS_ACCESS_KEY_ID,
      apiSecret: validatedEnvConfig.AWS_SECRET_ACCESS_KEY,
      region: validatedEnvConfig.S3_REGION,
      endpoint: validatedEnvConfig.S3_ENDPOINT,
    };
    super(serviceConfig);

    const s3ClientParams: any = {
      region: this.config.region || 'us-east-1',
      ...(this.config.endpoint && { endpoint: this.config.endpoint }),
    };

    if (this.config.apiKey && this.config.apiSecret) {
      s3ClientParams.credentials = {
        accessKeyId: this.config.apiKey,
        secretAccessKey: this.config.apiSecret,
      };
    }
    this.s3Client = new S3Client(s3ClientParams);
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
          const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
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
        ACL: args.public ? 'public-read' : 'private',
        Metadata: args.metadata || {},
        ...(args.tags && args.tags.length > 0 && {
          Tagging: args.tags.map(tag => `tag=${encodeURIComponent(tag)}`).join('&')
        }),
      });

      const result = await this.s3Client.send(putCommand);
      
      // Generate URL based on configuration
      const url = this.generateUrl(key);

      return {
        url,
        filename,
        size: buffer.length,
        format: fileExtension,
        service: 's3',
        metadata: {
          bucket: this.config.bucket,
          key,
          region: this.config.region,
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
        `S3 upload failed: ${error instanceof Error ? error.message : String(error)}`
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
    if (this.config.endpoint) {
      // Custom endpoint (like MinIO or other S3-compatible services)
      return `${this.config.endpoint}/${this.config.bucket}/${key}`;
    } else {
      // Standard AWS S3 URL
      return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
    }
  }
}
