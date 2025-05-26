import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadUploadConfig, UploadServiceConfig } from '../../src/services'; // Adjusted path

// Mock process.env
const originalEnv = { ...process.env };

describe('loadUploadConfig', () => {
  beforeEach(() => {
    // Restore originalEnv and then clear specific variables
    process.env = { ...originalEnv };
    delete process.env.UPLOAD_SERVICE;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_ENDPOINT;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_BUCKET;
    delete process.env.CLOUDFLARE_R2_REGION;
    delete process.env.CLOUDFLARE_R2_ENDPOINT;
    delete process.env.CF_ACCESS_KEY;
    delete process.env.CF_SECRET_KEY;
    delete process.env.CF_BUCKET;
    delete process.env.CF_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load S3 config with AWS environment variables', () => {
    process.env.AWS_ACCESS_KEY_ID = 'aws-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret';
    process.env.S3_BUCKET = 'my-bucket';
    process.env.S3_REGION = 'us-west-2';
    process.env.S3_ENDPOINT = 'https://s3.example.com';

    const config = loadUploadConfig('s3') as any; 

    expect(config.UPLOAD_SERVICE).toBe('s3');
    expect(config.AWS_ACCESS_KEY_ID).toBe('aws-key');
    expect(config.AWS_SECRET_ACCESS_KEY).toBe('aws-secret');
    expect(config.S3_BUCKET).toBe('my-bucket');
    expect(config.S3_REGION).toBe('us-west-2');
    expect(config.S3_ENDPOINT).toBe('https://s3.example.com');
  });
  
  it('should load Cloudflare config with R2 environment variables', () => {
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'cf-r2-key';
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'cf-r2-secret';
    process.env.CLOUDFLARE_R2_BUCKET = 'my-r2-bucket';
    process.env.CLOUDFLARE_R2_REGION = 'auto';
    process.env.CLOUDFLARE_R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';

    const config = loadUploadConfig('cloudflare') as UploadServiceConfig; // Cast to UploadServiceConfig for Cloudflare

    expect(config.service).toBe('cloudflare');
    expect(config.apiKey).toBe('cf-r2-key'); 
    expect(config.apiSecret).toBe('cf-r2-secret');
    expect(config.bucket).toBe('my-r2-bucket');
    expect(config.region).toBe('auto');
    expect(config.endpoint).toBe('https://account.r2.cloudflarestorage.com');
  });

  it('should load Cloudflare config with alternative CF_ environment variables', () => {
    process.env.CF_ACCESS_KEY = 'cf-key-alt';
    process.env.CF_SECRET_KEY = 'cf-secret-alt';
    process.env.CF_BUCKET = 'my-cf-bucket-alt';
    process.env.CF_ENDPOINT = 'https://alt.r2.cloudflarestorage.com';

    const config = loadUploadConfig('cloudflare') as UploadServiceConfig;
    expect(config.service).toBe('cloudflare');
    expect(config.apiKey).toBe('cf-key-alt');
    expect(config.apiSecret).toBe('cf-secret-alt');
    expect(config.bucket).toBe('my-cf-bucket-alt');
    expect(config.region).toBe('auto'); 
    expect(config.endpoint).toBe('https://alt.r2.cloudflarestorage.com');
  });

  it('should prefer CLOUDFLARE_R2 variables over CF variables for Cloudflare', () => {
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'cf-r2-key-pref';
    process.env.CF_ACCESS_KEY = 'cf-key-alt-pref';
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'cf-r2-secret-pref';
    process.env.CF_SECRET_KEY = 'cf-secret-alt-pref';

    const config = loadUploadConfig('cloudflare') as UploadServiceConfig;
    expect(config.apiKey).toBe('cf-r2-key-pref'); 
    expect(config.apiSecret).toBe('cf-r2-secret-pref');
  });

  it('should use service parameter over UPLOAD_SERVICE environment variable', () => {
    process.env.UPLOAD_SERVICE = 'cloudflare';
    const config = loadUploadConfig('s3') as any;
    expect(config.UPLOAD_SERVICE).toBe('s3');
  });

  it('should use UPLOAD_SERVICE environment variable when no service parameter specified', () => {
    process.env.UPLOAD_SERVICE = 'cloudflare';
    const config = loadUploadConfig() as UploadServiceConfig; // Cloudflare returns UploadServiceConfig
    expect(config.service).toBe('cloudflare');
  });

  it('should default to s3 when no service specified and no UPLOAD_SERVICE environment variable', () => {
    const config = loadUploadConfig() as any; // S3 returns ENV style
    expect(config.UPLOAD_SERVICE).toBe('s3');
  });

  it('should handle missing S3 environment variables gracefully by returning undefined for them', () => {
    const config = loadUploadConfig('s3') as any;
    expect(config.UPLOAD_SERVICE).toBe('s3');
    expect(config.S3_BUCKET).toBeUndefined();
    expect(config.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(config.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(config.S3_REGION).toBe('us-east-1'); 
    expect(config.S3_ENDPOINT).toBeUndefined();
  });
});