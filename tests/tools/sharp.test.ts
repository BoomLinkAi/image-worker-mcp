import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { resizeImageTool, resizeImageSchema } from '../../src/tools/sharp';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Sharp } from 'sharp';
import { z } from 'zod';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// A more comprehensive mock for sharp's fluent interface
const mockSharpInstance = {
  metadata: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  jpeg: vi.fn().mockReturnThis(),
  png: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  avif: vi.fn().mockReturnThis(),
  rotate: vi.fn().mockReturnThis(),
  flip: vi.fn().mockReturnThis(),
  flop: vi.fn().mockReturnThis(),
  grayscale: vi.fn().mockReturnThis(),
  blur: vi.fn().mockReturnThis(),
  sharpen: vi.fn().mockReturnThis(),
  gamma: vi.fn().mockReturnThis(),
  negate: vi.fn().mockReturnThis(),
  normalize: vi.fn().mockReturnThis(),
  threshold: vi.fn().mockReturnThis(),
  trim: vi.fn().mockReturnThis(),
  toBuffer: vi.fn(),
};

// Mock the sharp constructor to return our mock instance
vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

vi.mock('../../src/utils.js', () => ({
  fetchImageFromUrl: vi.fn(),
  base64ToBuffer: vi.fn(),
  bufferToBase64: vi.fn((buffer: Buffer) => `mockBase64-${buffer.toString()}`), // Simple mock for base64 conversion
  isValidInputFormat: vi.fn(),
  normalizeFilePath: vi.fn((path: string) => path), // Passthrough mock
}));

// Helper to create a minimal valid args object
export type ResizeImageArgs = z.infer<z.ZodObject<typeof resizeImageSchema>>;
const createValidArgs = (overrides: Partial<ResizeImageArgs> = {}): ResizeImageArgs => ({
  imagePath: 'test.jpg', // Default to imagePath
  ...overrides,
});

// A simple mock buffer
const mockImageBuffer = Buffer.from('mockImageData');
const mockOutputBuffer = Buffer.from('mockOutputData');

describe('resizeImageTool', () => {
  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Default implementations for mocks
    const fsActual = await import('fs');
    (fsActual.default.readFileSync as Mock).mockReturnValue(mockImageBuffer);
    (fsActual.default.writeFileSync as Mock).mockClear();


    const sharpActual = await import('sharp');
    (sharpActual.default as unknown as Mock).mockReturnValue(mockSharpInstance);

    // Reset calls for individual sharp instance methods
    Object.values(mockSharpInstance).forEach(mockFn => {
      if (typeof mockFn.mockClear === 'function') {
        mockFn.mockClear();
      }
    });

    mockSharpInstance.metadata.mockResolvedValue({ format: 'jpeg', width: 100, height: 100 });
    mockSharpInstance.toBuffer.mockResolvedValue(mockOutputBuffer);

    const utilsActual = await import('../../src/utils.js');
    (utilsActual.fetchImageFromUrl as Mock).mockResolvedValue(mockImageBuffer);
    (utilsActual.base64ToBuffer as Mock).mockReturnValue(mockImageBuffer);
    (utilsActual.isValidInputFormat as Mock).mockReturnValue(true);
    (utilsActual.bufferToBase64 as Mock).mockImplementation((buffer: Buffer) => `mockBase64-${buffer.toString()}`);
    (utilsActual.normalizeFilePath as Mock).mockImplementation((path: string) => path);


  });

  it('should throw McpError if no image source is provided', async () => {
    const args = createValidArgs({ imagePath: undefined, imageUrl: undefined, base64Image: undefined });
    await expect(resizeImageTool(args)).rejects.toThrow(
      new McpError(ErrorCode.InvalidParams, 'One of imagePath, imageUrl, or base64Image must be provided'),
    );
  });

  it('should process image from imagePath successfully', async () => {
    const fsActual = await import('fs');
    const args = createValidArgs({ imagePath: 'input.jpg', outputPath: 'output.jpg', width: 50, height: 50 });
    
    const result = await resizeImageTool(args);

    expect(fsActual.default.readFileSync).toHaveBeenCalledWith('input.jpg');
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(expect.objectContaining({ width: 50, height: 50 }));
    expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 }); // Assuming default quality
    expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
    expect(fsActual.default.writeFileSync).toHaveBeenCalledWith('output.jpg', mockOutputBuffer);
    
    expect(result.isError).toBeUndefined();
    expect(result.content).toBeDefined();
    expect(result.content).toHaveLength(1);
    if (!result.content || typeof result.content[0].text !== 'string') {
      throw new Error('Invalid result content');
    }
    const resultContent = JSON.parse(result.content[0].text);
    expect(resultContent.image).toBe('mockBase64-mockOutputData');
    expect(resultContent.format).toBe('jpeg'); // Default output format if not specified and input is jpeg
    expect(resultContent.savedTo).toBe('output.jpg');
    expect(resultContent.source).toBe('file');
  });

  it('should process image from imageUrl successfully', async () => {
    const utilsActual = await import('../../src/utils.js');
    const args = createValidArgs({ imagePath: undefined, imageUrl: 'http://example.com/image.png', format: 'png' });
    mockSharpInstance.metadata.mockResolvedValue({ format: 'png', width: 200, height: 150 });

    const result = await resizeImageTool(args);

    expect(utilsActual.fetchImageFromUrl).toHaveBeenCalledWith('http://example.com/image.png');
    expect(mockSharpInstance.png).toHaveBeenCalledWith({ quality: 80 });
    expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
    
    expect(result.isError).toBeUndefined();
    expect(result.content).toBeDefined();
    expect(result.content).toHaveLength(1);
    if (!result.content || typeof result.content[0].text !== 'string') {
      throw new Error('Invalid result content');
    }
    const resultContent = JSON.parse(result.content[0].text);
    expect(resultContent.image).toBe('mockBase64-mockOutputData');
    expect(resultContent.format).toBe('png');
    expect(resultContent.source).toBe('url');
  });

  it('should process image from base64Image successfully', async () => {
    const utilsActual = await import('../../src/utils.js');
    const base64String = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='; // Minimal webp
    const args = createValidArgs({ imagePath: undefined, base64Image: base64String, format: 'webp' });
    mockSharpInstance.metadata.mockResolvedValue({ format: 'webp', width: 10, height: 10 });

    const result = await resizeImageTool(args);

    expect(utilsActual.base64ToBuffer).toHaveBeenCalledWith(base64String);
    expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });
    expect(mockSharpInstance.toBuffer).toHaveBeenCalled();

    expect(result.isError).toBeUndefined();
    expect(result.content).toBeDefined();
    expect(result.content).toHaveLength(1);
    if (!result.content || typeof result.content[0].text !== 'string') {
      throw new Error('Invalid result content');
    }
    const resultContent = JSON.parse(result.content[0].text);
    expect(resultContent.image).toBe('mockBase64-mockOutputData');
    expect(resultContent.format).toBe('webp');
    expect(resultContent.source).toBe('base64');
  });

  it('should throw McpError for unsupported input format', async () => {
    const utilsActual = await import('../../src/utils.js');
    (utilsActual.isValidInputFormat as Mock).mockReturnValue(false);
    mockSharpInstance.metadata.mockResolvedValue({ format: 'bmp', width: 100, height: 100 });
    const args = createValidArgs({ imagePath: 'input.bmp' });

    await expect(resizeImageTool(args)).rejects.toThrow(
      new McpError(ErrorCode.InvalidParams, 'Unsupported input format: bmp'),
    );
  });
  
  it('should throw McpError if fs.readFileSync fails', async () => {
    const fsActual = await import('fs');
    (fsActual.default.readFileSync as Mock).mockImplementation(() => {
      throw new Error('File not found');
    });
    const args = createValidArgs({ imagePath: 'nonexistent.jpg' });

    await expect(resizeImageTool(args)).rejects.toThrow(
      new McpError(ErrorCode.InvalidParams, 'Failed to read image from path: nonexistent.jpg. File not found'),
    );
  });

  it('should throw McpError if fs.writeFileSync fails', async () => {
    const fsActual = await import('fs');
    (fsActual.default.writeFileSync as Mock).mockImplementation(() => {
      throw new Error('Disk full');
    });
    const args = createValidArgs({ imagePath: 'input.jpg', outputPath: 'output.jpg' });
    
    await expect(resizeImageTool(args)).rejects.toThrow(
      new McpError(ErrorCode.InternalError, 'Failed to save image to output.jpg: Disk full'),
    );
  });

  it('should apply various transformations like rotate and grayscale', async () => {
    const args = createValidArgs({ imagePath: 'input.jpg', rotate: 90, grayscale: true });
    
    await resizeImageTool(args);

    expect(mockSharpInstance.rotate).toHaveBeenCalledWith(90);
    expect(mockSharpInstance.grayscale).toHaveBeenCalled();
  });

  it('should handle aspect ratio correctly when only width is provided', async () => {
    const args = createValidArgs({ imagePath: 'input.jpg', width: 100 });
    await resizeImageTool(args);
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(expect.objectContaining({ width: 100, height: undefined }));
  });

  it('should handle aspect ratio correctly when only height is provided', async () => {
    const args = createValidArgs({ imagePath: 'input.jpg', height: 100 });
    await resizeImageTool(args);
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(expect.objectContaining({ width: undefined, height: 100 }));
  });
  
  it('should use default dimensions and "contain" fit if none are provided', async () => {
    // This test needs to ensure constants are mocked correctly *before* the module under test is imported,
    // or it needs to re-import the module after mocking constants if they are top-level.
    // For simplicity, we'll assume constants are used as imported.
    // If constants were dynamic, this test would be more complex.
    // We are testing the logic within resizeImageTool that uses these defaults.
    
    // Reset modules to ensure a fresh import of constants for this test
    vi.resetModules();
    
    // Mock constants specifically for this test case
    vi.doMock('../../src/constants.js', async () => {
      // It's important to import the original AFTER resetModules and within the factory
      // if you need to spread original values, but here we are fully defining them.
      return {
        DEFAULT_WIDTH: 300,
        DEFAULT_HEIGHT: 200,
        DEFAULT_QUALITY: 80, // Ensure this is also covered
        SUPPORTED_OUTPUT_FORMATS: ['jpeg', 'png', 'webp', 'avif', 'jpg'], // Match original or ensure it's sufficient
        // Add other constants if they are used by the module and need specific values or existence
      };
    });

    // Dynamically import the module under test AFTER mocks are set up
    const { resizeImageTool: toolWithMockedConstants } = await import('../../src/tools/sharp.js');
    
    const args = createValidArgs({ imagePath: 'input.jpg' }); // No width, height, or fit
    await toolWithMockedConstants(args);
    
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(expect.objectContaining({ width: 300, height: 200, fit: 'contain' }));
    
    // Clean up the mock for constants.js so it doesn't affect other tests
    vi.doUnmock('../../src/constants.js');
    // Reset modules again to ensure subsequent tests get a clean state if they also import constants.js
    vi.resetModules();
  });

});