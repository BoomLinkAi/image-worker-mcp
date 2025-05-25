import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { resizeImageTool, resizeImageSchema } from '../../src/tools/sharp';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Sharp } from 'sharp';
import { z } from 'zod';
import fsActual from 'fs'; // Import actual fs for reading test file

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
    const fsMockFromSetup = await import('fs'); // fs is mocked globally
    (fsMockFromSetup.default.readFileSync as Mock).mockReturnValue(mockImageBuffer);
    (fsMockFromSetup.default.writeFileSync as Mock).mockClear();

    const sharpModule = await import('sharp');
    // Only try to setup mockReturnValue if sharp.default is actually a mock function
    // This allows beforeEach to coexist with tests that unmock 'sharp'
    if (vi.isMockFunction(sharpModule.default)) {
      (sharpModule.default as unknown as Mock).mockReturnValue(mockSharpInstance);
    }

    // Reset calls for individual sharp instance methods on our shared mockSharpInstance
    Object.values(mockSharpInstance).forEach(mockFn => {
      if (typeof mockFn.mockClear === 'function') {
        mockFn.mockClear();
      }
    });

    mockSharpInstance.metadata.mockResolvedValue({ format: 'jpeg', width: 100, height: 100 });
    mockSharpInstance.toBuffer.mockResolvedValue(mockOutputBuffer);

    const utilsActual = await import('../../src/utils.js');
    if (vi.isMockFunction(utilsActual.fetchImageFromUrl)) {
      (utilsActual.fetchImageFromUrl as Mock).mockResolvedValue(mockImageBuffer);
    }
    if (vi.isMockFunction(utilsActual.base64ToBuffer)) {
      (utilsActual.base64ToBuffer as Mock).mockReturnValue(mockImageBuffer);
    }
    if (vi.isMockFunction(utilsActual.isValidInputFormat)) {
      (utilsActual.isValidInputFormat as Mock).mockReturnValue(true);
    }
    if (vi.isMockFunction(utilsActual.bufferToBase64)) {
      (utilsActual.bufferToBase64 as Mock).mockImplementation((buffer: Buffer) => `mockBase64-${buffer.toString()}`);
    }
    if (vi.isMockFunction(utilsActual.normalizeFilePath)) {
      (utilsActual.normalizeFilePath as Mock).mockImplementation((path: string) => path);
    }


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

  it('should process HEIC image successfully using actual libheif-js and sharp', async () => {
    // Unmock sharp, libheif-js, and utils for this integration test
    vi.doUnmock('sharp');
    vi.doUnmock('libheif-js');
    vi.doUnmock('../../src/utils.js'); // Ensure actual utils are used
    vi.resetModules(); // Important to clear cache and re-import actual modules

    // Dynamically import the tool to get the version with actual sharp/libheif/utils
    const { resizeImageTool: actualResizeImageTool } = await import('../../src/tools/sharp.js');
    const path = await vi.importActual<typeof import('path')>('path');
    const nodeFs = await vi.importActual<typeof import('fs')>('fs');

    const heicFileName = 'image1.heic';
    const heicFilePath = path.resolve(__dirname, '../assets', heicFileName);
    const outputJpegFileName = 'output.heic.integration.test.jpg';
    const outputJpegPath = path.resolve(__dirname, '../assets', outputJpegFileName);

    // Ensure the output file from previous runs is cleaned up
    if (nodeFs.existsSync(outputJpegPath)) {
      nodeFs.unlinkSync(outputJpegPath);
    }

    const heicInputBuffer = nodeFs.readFileSync(heicFilePath);
    if (!heicInputBuffer || heicInputBuffer.length === 0) {
      throw new Error(`Failed to read actual HEIC file or file is empty: ${heicFilePath}`);
    }

    // The 'fs' module used by the tool is mocked globally.
    // We need its readFileSync to return the actual HEIC buffer for this specific path.
    const mockedFsModule = await import('fs');
    const originalReadFileSyncMock = mockedFsModule.default.readFileSync as Mock;
    (mockedFsModule.default.readFileSync as Mock).mockImplementation((p: string) => {
      if (p === heicFilePath) {
        return heicInputBuffer;
      }
      // Fallback to original mock behavior for other paths if necessary
      // For this test, we only expect heicFilePath to be read by the tool.
      // If other tests rely on the default mockImageBuffer, this could be:
      // return mockImageBuffer;
      // However, to be strict for this test:
      throw new Error(`Unexpected readFileSync call in HEIC test: ${p}`);
    });

    // Ensure writeFileSync is a mock we can inspect and control for this test
    const mockWriteFileSync = mockedFsModule.default.writeFileSync as Mock;
    let capturedBufferForActualWrite: Buffer | undefined;
    mockWriteFileSync.mockImplementation((filePath: string, data: Buffer) => {
      if (filePath === outputJpegPath) {
        capturedBufferForActualWrite = data; // Capture buffer
      }
      // Do not throw, simulate successful mock write
    });

    const args = {
      imagePath: heicFilePath, // Tool will use this path
      format: 'jpeg',
      width: 60, // Different dimensions for testing
      height: 40,
      quality: 85,
      outputPath: outputJpegPath,
    };

    const result = await actualResizeImageTool(args as any);

    // Restore original readFileSync mock for other tests
    (mockedFsModule.default.readFileSync as Mock).mockImplementation(originalReadFileSyncMock);


    expect(result.isError).toBeUndefined();
    expect(result.content).toBeDefined();
    expect(result.content).toHaveLength(1);
    if (!result.content || typeof result.content[0].text !== 'string') {
      throw new Error('Invalid result content for HEIC test');
    }
    const resultContent = JSON.parse(result.content[0].text);

    expect(resultContent.format).toBe('jpeg');
    expect(resultContent.width).toBe(60);
    expect(resultContent.height).toBe(40);
    expect(resultContent.source).toBe('file');
    expect(resultContent.savedTo).toBe(outputJpegPath);
    expect(resultContent.image).toBeDefined();
    expect(typeof resultContent.image).toBe('string');
    expect(resultContent.image.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(resultContent.image.length).toBeGreaterThan(50); // Basic check for non-empty base64

    // Verify the mock writeFileSync was called by the tool
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(mockWriteFileSync).toHaveBeenCalledWith(outputJpegPath, capturedBufferForActualWrite);

    // Now, perform the actual write using the captured buffer for verification purposes
    expect(capturedBufferForActualWrite).toBeInstanceOf(Buffer);
    if (!capturedBufferForActualWrite) throw new Error('Buffer to write was not captured');

    nodeFs.writeFileSync(outputJpegPath, capturedBufferForActualWrite); // Actual write

    // Read the actually written file and verify its properties with actual sharp
    expect(nodeFs.existsSync(outputJpegPath)).toBe(true);
    const writtenBuffer = nodeFs.readFileSync(outputJpegPath); // Actual read
    const sharpActual = (await import('sharp')).default;
    const metadata = await sharpActual(writtenBuffer).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(60);
    expect(metadata.height).toBe(40);

    // Cleanup the created file
    if (nodeFs.existsSync(outputJpegPath)) {
      nodeFs.unlinkSync(outputJpegPath);
    }
  });

  it('should process HEIC to PNG (base64 output) successfully using actual libheif-js and sharp', async () => {
    // Unmock sharp, libheif-js, and utils for this integration test
    vi.doUnmock('sharp');
    vi.doUnmock('libheif-js');
    vi.doUnmock('../../src/utils.js'); // Ensure actual utils are used
    vi.resetModules();

    // Dynamically import the tool to get the version with actual sharp/libheif/utils
    const { resizeImageTool: actualResizeImageTool } = await import('../../src/tools/sharp.js');
    const path = await vi.importActual<typeof import('path')>('path');
    const nodeFs = await vi.importActual<typeof import('fs')>('fs');
    const sharpActual = (await import('sharp')).default; // For verifying output

    const heicFileName = 'image1.heic';
    const heicFilePath = path.resolve(__dirname, '../assets', heicFileName);
    const heicInputBuffer = nodeFs.readFileSync(heicFilePath);
    if (!heicInputBuffer || heicInputBuffer.length === 0) {
      throw new Error(`Failed to read actual HEIC file for PNG test or file is empty: ${heicFilePath}`);
    }

    const mockedFsModule = await import('fs');
    const originalReadFileSyncMock = mockedFsModule.default.readFileSync as Mock;
    (mockedFsModule.default.readFileSync as Mock).mockImplementation((p: string) => {
      if (p === heicFilePath) {
        return heicInputBuffer;
      }
      throw new Error(`Unexpected readFileSync call in HEIC to PNG test: ${p}`);
    });

    const mockWriteFileSync = mockedFsModule.default.writeFileSync as Mock;
    mockWriteFileSync.mockClear();

    const targetWidth = 70;
    const targetHeight = 50;

    const args = {
      imagePath: heicFilePath,
      format: 'png',
      width: targetWidth,
      height: targetHeight,
      quality: 90,
      // No outputPath, so it should return base64 only
    };

    const result = await actualResizeImageTool(args as any);

    // Restore original readFileSync mock
    (mockedFsModule.default.readFileSync as Mock).mockImplementation(originalReadFileSyncMock);

    expect(result.isError).toBeUndefined();
    expect(result.content).toBeDefined();
    expect(result.content).toHaveLength(1);
    if (!result.content || typeof result.content[0].text !== 'string') {
      throw new Error('Invalid result content for HEIC to PNG test');
    }
    const resultContent = JSON.parse(result.content[0].text);

    expect(resultContent.format).toBe('png');
    expect(resultContent.width).toBe(targetWidth);
    expect(resultContent.height).toBe(targetHeight);
    expect(resultContent.source).toBe('file');
    expect(resultContent.savedTo).toBeNull(); // Not saved to file
    expect(resultContent.image).toBeDefined();
    expect(typeof resultContent.image).toBe('string');
    expect(resultContent.image.startsWith('data:image/png;base64,')).toBe(true);
    expect(resultContent.image.length).toBeGreaterThan(50);

    // Verify writeFileSync was NOT called
    expect(mockWriteFileSync).not.toHaveBeenCalled();

    // Verify the dimensions and format of the base64 output by decoding it
    const base64Data = resultContent.image.replace(/^data:image\/png;base64,/, '');
    const outputBuffer = Buffer.from(base64Data, 'base64');
    const metadata = await sharpActual(outputBuffer).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(targetWidth);
    expect(metadata.height).toBe(targetHeight);
  });
});