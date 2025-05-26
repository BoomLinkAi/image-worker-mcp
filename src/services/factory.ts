import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { BaseUploadService, UploadService } from './types';
import { S3UploadService, S3EnvConfigSchema, ValidatedS3EnvConfig } from './s3';
import { CloudflareUploadService, CloudflareEnvConfigSchema, ValidatedCloudflareEnvConfig } from './cloudflare';

export function loadUploadConfig(service?: UploadService): ValidatedS3EnvConfig | ValidatedCloudflareEnvConfig {
  const selectedService = service || (process.env.UPLOAD_SERVICE as UploadService) || 's3';

  if (selectedService === 's3') {
    const s3RawConfig = S3EnvConfigSchema.parse({
      UPLOAD_SERVICE: 's3',
      S3_BUCKET: process.env.S3_BUCKET,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      S3_REGION: process.env.S3_REGION || 'us-east-1',
      S3_ENDPOINT: process.env.S3_ENDPOINT,
    });
    return s3RawConfig;
  } else if (selectedService === 'cloudflare') {
    const cfRawConfig = CloudflareEnvConfigSchema.parse({
      UPLOAD_SERVICE: 'cloudflare',
      CLOUDFLARE_R2_BUCKET: process.env.CLOUDFLARE_R2_BUCKET,
      CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      CLOUDFLARE_R2_REGION: process.env.CLOUDFLARE_R2_REGION || 'auto',
      CLOUDFLARE_R2_ENDPOINT: process.env.CLOUDFLARE_R2_ENDPOINT,
    });
    return cfRawConfig;
  } else {
    throw new McpError(ErrorCode.InvalidParams, `Unsupported upload service`);
  }
}


export class UploadServiceFactory {
  static create(service?: UploadService): BaseUploadService {
    try {
      const config = loadUploadConfig(service);
      switch (config.UPLOAD_SERVICE) {
        case 's3':
          return new S3UploadService(config);
        case 'cloudflare':
          return new CloudflareUploadService(config);
        default:
          throw new McpError(ErrorCode.InvalidParams, `Unsupported upload service`);
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new McpError(
          ErrorCode.InvalidParams,
          `S3 configuration validation failed: ${errorMessage}`
        );
      }
      throw error;
    }
  }
}
