import {
  isValidInputFormat,
  isValidOutputFormat,
  isValidDimensions,
  isValidQuality,
  getFileExtension,
  base64ToBuffer,
  bufferToBase64,
  normalizeFilePath,
  // fetchImageFromUrl, // Requires mocking for proper unit testing
} from '../src/utils';
import { SUPPORTED_INPUT_FORMATS, SUPPORTED_OUTPUT_FORMATS } from '../src/constants';

describe('Utility Functions', () => {
  describe('isValidInputFormat', () => {
    it('should return true for supported input formats', () => {
      SUPPORTED_INPUT_FORMATS.forEach(format => {
        expect(isValidInputFormat(format)).toBe(true);
        expect(isValidInputFormat(format.toUpperCase())).toBe(true);
      });
    });

    it('should return false for unsupported input formats', () => {
      expect(isValidInputFormat('bmp')).toBe(false);
      expect(isValidInputFormat('exe')).toBe(false);
    });
  });

  describe('isValidOutputFormat', () => {
    it('should return true for supported output formats', () => {
      SUPPORTED_OUTPUT_FORMATS.forEach(format => {
        expect(isValidOutputFormat(format)).toBe(true);
        expect(isValidOutputFormat(format.toUpperCase())).toBe(true);
      });
    });

    it('should return false for unsupported output formats', () => {
      expect(isValidOutputFormat('gif')).toBe(false); // Assuming gif is not in SUPPORTED_OUTPUT_FORMATS
      expect(isValidOutputFormat('tiff')).toBe(false);
    });
  });

  describe('isValidDimensions', () => {
    it('should return true for valid dimensions', () => {
      expect(isValidDimensions(100, 100)).toBe(true);
      expect(isValidDimensions(1, 1)).toBe(true);
      expect(isValidDimensions(10000, 10000)).toBe(true);
      expect(isValidDimensions(undefined, 100)).toBe(true);
      expect(isValidDimensions(100, undefined)).toBe(true);
      expect(isValidDimensions(undefined, undefined)).toBe(true);
    });

    it('should return false for invalid dimensions', () => {
      expect(isValidDimensions(0, 100)).toBe(false);
      expect(isValidDimensions(100, 0)).toBe(false);
      expect(isValidDimensions(10001, 100)).toBe(false);
      expect(isValidDimensions(100, 10001)).toBe(false);
    });
  });

  describe('isValidQuality', () => {
    it('should return true for valid quality values', () => {
      expect(isValidQuality(1)).toBe(true);
      expect(isValidQuality(50)).toBe(true);
      expect(isValidQuality(100)).toBe(true);
      expect(isValidQuality(undefined)).toBe(true);
    });

    it('should return false for invalid quality values', () => {
      expect(isValidQuality(0)).toBe(false);
      expect(isValidQuality(101)).toBe(false);
    });
  });

  describe('getFileExtension', () => {
    it('should return the correct extension in lowercase', () => {
      expect(getFileExtension('image.JPEG')).toBe('jpeg');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
      expect(getFileExtension('document.PDF')).toBe('pdf');
    });

    it('should return an empty string if no extension', () => {
      expect(getFileExtension('filename')).toBe('');
    });

    it('should handle files starting with a dot', () => {
      expect(getFileExtension('.bashrc')).toBe('bashrc');
      expect(getFileExtension('.env.local')).toBe('local');
    });
  });

  describe('base64ToBuffer', () => {
    it('should convert a base64 string to a Buffer', () => {
      const text = 'Hello World';
      const base64Text = Buffer.from(text).toString('base64');
      const buffer = base64ToBuffer(base64Text);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe(text);
    });

    it('should handle base64 strings with data URL prefix', () => {
      const text = 'Hello Again';
      const base64TextWithPrefix = `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
      const buffer = base64ToBuffer(base64TextWithPrefix);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe(text);
    });
  });

  describe('bufferToBase64', () => {
    it('should convert a Buffer to a data URL base64 string', () => {
      const text = 'Buffer Test';
      const buffer = Buffer.from(text);
      const mimeType = 'image/jpeg';
      const base64String = bufferToBase64(buffer, mimeType);
      expect(base64String).toBe(`data:${mimeType};base64,${buffer.toString('base64')}`);
    });
  });

  describe('normalizeFilePath', () => {
    it('should replace escaped spaces with actual spaces', () => {
      expect(normalizeFilePath('a\\ file\\ name.png')).toBe('a file name.png');
    });

    it('should handle various escaped characters', () => {
      expect(normalizeFilePath('path\\ with\\\'quotes\\\'.txt')).toBe("path with'quotes'.txt");
      expect(normalizeFilePath('path\\ with\\\"double\\ quotes\\\".txt')).toBe('path with"double quotes".txt');
      expect(normalizeFilePath('path\\ with\\`backticks\\`.txt')).toBe('path with`backticks`.txt');
      expect(normalizeFilePath('folder\\(parens\\).jpg')).toBe('folder(parens).jpg');
      expect(normalizeFilePath('archive\\\\[brackets\\\\].zip')).toBe('archive[brackets].zip');
      expect(normalizeFilePath('config\\{braces\\}.json')).toBe('config{braces}.json');
    });

    it('should return the same path if no escaped characters', () => {
      expect(normalizeFilePath('a/normal/path.txt')).toBe('a/normal/path.txt');
    });

    it('should handle mixed escaped and normal characters', () => {
      expect(normalizeFilePath('My\\ Documents/image\\(1\\).png')).toBe('My Documents/image(1).png');
    });
  });
});