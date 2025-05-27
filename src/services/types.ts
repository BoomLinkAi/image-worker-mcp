import { SUPPORTED_UPLOAD_SERVICES } from '../constants';

// Define upload service type
export type UploadService = typeof SUPPORTED_UPLOAD_SERVICES[number];

// Upload service configuration interface
export interface UploadServiceConfig {
  service: UploadService;
  apiKey?: string;
  apiSecret?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  cloudName?: string;
  uploadPreset?: string;
  localPath?: string;
  baseUrl?: string;
  projectId?: string;
}

// Upload result interface
export interface UploadResult {
  url: string;
  publicId?: string;
  filename: string;
  size: number;
  format: string;
  width?: number;
  height?: number;
  service: UploadService;
  metadata?: Record<string, any>;
}

// Upload arguments type (will be imported from upload tool)
export interface UploadImageArgs {
  imagePath?: string;
  imageUrl?: string;
  base64Image?: string;
  service?: UploadService;
  filename?: string;
  folder?: string;
  public?: boolean;
  overwrite?: boolean;
  tags?: string[];
  metadata?: Record<string, string>;
}

// Abstract base class for upload services
export abstract class BaseUploadService {
  protected config: UploadServiceConfig;

  constructor(config: UploadServiceConfig) {
    this.config = config;
  }

  abstract upload(buffer: Buffer, filename: string, args: UploadImageArgs): Promise<UploadResult>;
}
