import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { BaseUploadService, UploadServiceConfig } from './types';
import { S3UploadService } from './s3';
import { CloudflareUploadService } from './cloudflare';

// Upload service factory
export class UploadServiceFactory {
  static create(config: UploadServiceConfig): BaseUploadService {
    switch (config.service) {
      case 's3':
        return new S3UploadService(config);
      case 'cloudflare':
        return new CloudflareUploadService(config);
      default:
        throw new McpError(ErrorCode.InvalidParams, `Unsupported upload service: ${config.service}`);
    }
  }
}