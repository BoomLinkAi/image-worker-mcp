import { z } from 'zod'; // For ZodError type checking
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { BaseUploadService, UploadService, UploadServiceConfig } from './types';
import { S3UploadService, S3EnvConfigSchema, ValidatedS3EnvConfig } from './s3';
import { CloudflareUploadService } from './cloudflare';

export function loadUploadConfig(service?: UploadService): UploadServiceConfig | ValidatedS3EnvConfig {
  const selectedService = service || (process.env.UPLOAD_SERVICE as UploadService) || 's3';

  if (selectedService === 's3') {
    const s3RawConfig: ValidatedS3EnvConfig = { // Type it as ValidatedS3EnvConfig
      UPLOAD_SERVICE: 's3',
      S3_BUCKET: process.env.S3_BUCKET!, // Add non-null assertion if you expect it from schema
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      S3_REGION: process.env.S3_REGION || 'us-east-1',
      S3_ENDPOINT: process.env.S3_ENDPOINT,
    };
    return s3RawConfig;
  } else if (selectedService === 'cloudflare') {
    const cfConfig: UploadServiceConfig = {
      service: 'cloudflare',
      bucket: process.env.CLOUDFLARE_R2_BUCKET || process.env.CF_BUCKET,
      apiKey: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.CF_ACCESS_KEY,
      apiSecret: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.CF_SECRET_KEY,
      region: process.env.CLOUDFLARE_R2_REGION || 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || process.env.CF_ENDPOINT,
    };
    return cfConfig;
  } else {
    // Fallback for other or unknown services, though this case might not be hit
    // if selectedService is strictly 's3' or 'cloudflare' based on prior logic.
    return { service: selectedService } as UploadServiceConfig;
  }
}


export class UploadServiceFactory {
  static create(config: UploadServiceConfig | ValidatedS3EnvConfig): BaseUploadService {
    const serviceType = (config as UploadServiceConfig).service || (config as ValidatedS3EnvConfig).UPLOAD_SERVICE;

    switch (serviceType) {
      case 's3':
        try {
          // The config should already be in the ValidatedS3EnvConfig format if it came from loadUploadConfig for 's3'
          // If it's passed directly as UploadServiceConfig, we might need a transformation here,
          // but current loadUploadConfig for 's3' returns ENV style.
          const validatedS3Config = S3EnvConfigSchema.parse(config as any); // Cast to any for parse
          return new S3UploadService(validatedS3Config);
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
      case 'cloudflare':
        // For Cloudflare, config should be UploadServiceConfig as returned by loadUploadConfig
        // TODO: Implement similar Zod validation for Cloudflare config if desired
        return new CloudflareUploadService(config as UploadServiceConfig);
      default:
        throw new McpError(ErrorCode.InvalidParams, `Unsupported upload service: ${serviceType}`);
    }
  }
}
