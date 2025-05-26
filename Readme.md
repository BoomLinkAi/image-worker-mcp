# @boomlinkai/image-worker-mcp

MCP server for image processing and cloud storage upload.

## Installation

You can install the Image Resize MCP CLI globally to use it across projects:

```sh
# Using npm
npm install -g @boomlinkai/image-worker-mcp

# Using yarn
yarn global add @boomlinkai/image-worker-mcp

# Using pnpm
pnpm add -g @boomlinkai/image-worker-mcp
```

Or use it directly with npx/pnpm dlx/yarn dlx:

```sh
npx @boomlinkai/image-worker-mcp
```

## Features

- Resize images to different dimensions
- Convert images between formats (JPEG, PNG, WebP, AVIF) or from (HEIC, HEIF)
- Optimize images for web use
- Apply basic transformations (rotate, flip, etc.)
- Upload images to cloud storage (AWS S3, Cloudflare R2)
- Support for multiple input sources (file path, URL, base64)

## Usage

The package provides an MCP server that can be executed via stdio, allowing it to be used as a tool by AI assistants.

### MCP Server Configuration

To use this as an MCP server, add it to your MCP settings configuration:

```json
{
  "mcpServers": {
    "image-worker": {
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

### Platform Integrations

Here are examples of how to configure the Image Resize MCP in different platforms:

#### Cursor

Add to ~/.cursor/mcp.json or .cursor/mcp.json in your project:

```json
{
  "mcpServers": {
    "image-worker": {
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

#### Windsurf

Add to your Windsurf MCP config file:

```json
{
  "mcpServers": {
    "image-worker": {
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

#### VS Code

Add to your VS Code MCP config file:

```json
{
  "servers": {
    "ImageResize": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

#### Zed

Add to your Zed settings.json:

```json
{
  "context_servers": {
    "ImageResize": {
      "command": {
        "path": "npx",
        "args": ["-y", "@boomlinkai/image-worker-mcp"]
      },
      "settings": {}
    }
  }
}
```

#### Claude Code

Run this command:

```sh
claude mcp add image-worker -- npx -y @boomlinkai/image-worker-mcp
```

#### Claude Desktop

Add to your Claude Desktop claude_desktop_config.json file:

```json
{
  "mcpServers": {
    "ImageResize": {
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

#### BoltAI

Open the "Settings" page of the app, navigate to "Plugins," and enter the following JSON:

```json
{
  "mcpServers": {
    "image-worker": {
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

#### Roo Code

Add to your Roo Code settings.json:

```json
{
  "servers": {
    "ImageResize": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@boomlinkai/image-worker-mcp"]
    }
  }
}
```

## Supported Options

### `resize_image` tool

The `resize_image` tool, provided by this MCP server, accepts the following arguments. These are based on the `sharp` image processing library.

**Input Image (at least one required):**

*   `imagePath` (string, optional): Filesystem path to the input image.
    *   Example: `/path/to/your/image.jpg`
*   `imageUrl` (string, optional): URL of the input image.
    *   Example: `https://example.com/image.png`
*   `base64Image` (string, optional): Base64-encoded image data. Can include a data URL prefix (e.g., `data:image/jpeg;base64,...`) or be raw base64.
    *   Example: `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...`

**Output Options:**

*   `format` (enum, optional): Desired output image format.
    *   Supported values: `jpeg`, `jpg`, `png`, `webp`, `avif`.
    *   If not specified, the input format is used if supported, otherwise defaults to a common format.
*   `quality` (number, optional): Quality for lossy formats like JPEG, WebP, AVIF (1-100).
    *   Defaults to a pre-configured value (typically around 80).
*   `outputPath` (string, optional): Filesystem path to save the processed image.
    *   If not provided, the image is returned as base64 data in the response.
    *   Example: `/path/to/save/resized_image.webp`
*   `outputImage` (boolean, optional): Whether to include the base64-encoded image in the output response.
    *   If not provided, will not include base64 image in response.


**Resizing and Dimensions:**

*   `width` (number, optional): Target width in pixels (1-10000).
    *   If only `width` is provided, `height` is adjusted to maintain aspect ratio.
    *   If neither `width` nor `height` is specified, defaults to a pre-configured value (e.g., 1024).
*   `height` (number, optional): Target height in pixels (1-10000).
    *   If only `height` is provided, `width` is adjusted to maintain aspect ratio.
    *   If neither `width` nor `height` is specified, defaults to a pre-configured value (e.g., 1024).
*   `fit` (enum, optional): How the image should be resized to fit the specified `width` and `height`.
    *   Values: `cover`, `contain`, `fill`, `inside`, `outside`.
    *   Defaults to `contain` if both `width` and `height` are specified but `fit` is not.
*   `position` (enum, optional): Position to use when `fit` is `cover` or `contain`.
    *   Values:`top`, `right top`, `right`, `right bottom`, `bottom`, `left bottom`, `left`, `left top`.
*   `background` (string, optional): Background color to use when `fit` results in empty areas (e.g., for `contain`).
    *   Format: CSS color string (e.g., `#RRGGBB`, `rgba(r,g,b,a)`).
    *   Example: `#FFFFFF`, `rgba(0,0,0,0.5)`
*   `withoutEnlargement` (boolean, optional): If true, do not enlarge the image if its original dimensions are smaller than the target `width`/`height`.
*   `withoutReduction` (boolean, optional): If true, do not reduce the image if its original dimensions are larger than the target `width`/`height`.
*   `trim` (boolean, optional): Trim "boring" pixels from all edges based on the top-left pixel color.

**Transformations & Effects:**

*   `rotate` (number, optional): Angle of rotation (e.g., 90, 180, 270).
*   `flip` (boolean, optional): Flip the image vertically.
*   `flop` (boolean, optional): Flop (mirror) the image horizontally.
*   `grayscale` (boolean, optional): Convert the image to grayscale.
*   `blur` (number, optional): Apply a Gaussian blur. Sigma value between 0.3 and 1000.
*   `sharpen` (number, optional): Apply a sharpening effect. Sigma value between 0.3 and 1000.
*   `gamma` (number, optional): Apply gamma correction. Value between 1.0 and 3.0.
*   `negate` (boolean, optional): Produce a negative of the image.
*   `normalize` (boolean, optional): Enhance image contrast by stretching its intensity levels (histogram normalization).
*   `threshold` (number, optional): Apply a threshold to the image, converting it to black and white based on luminance. Value between 0 and 255.

### `upload_image` tool

The `upload_image` tool allows you to upload processed images to cloud storage services like AWS S3 or Cloudflare R2.

**Input Image (at least one required):**

*   `imagePath` (string, optional): Filesystem path to the input image.
    *   Example: `/path/to/your/image.jpg`
*   `imageUrl` (string, optional): URL of the input image to download and upload.
    *   Example: `https://example.com/image.png`
*   `base64Image` (string, optional): Base64-encoded image data. Can include a data URL prefix or be raw base64.
    *   Example: `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...`

**Upload Configuration:**

*   `service` (enum, optional): Upload service to use.
    *   Supported values: `s3`, `cloudflare`.
    *   Defaults to `s3` or the value of `UPLOAD_SERVICE` environment variable.
*   `filename` (string, optional): Custom filename for the uploaded image (without extension).
    *   If not provided, uses the original filename or generates a unique one.
    *   Example: `my-custom-image`
*   `folder` (string, optional): Folder/directory to upload to (service-specific).
    *   Example: `uploads/2024/january`
*   `public` (boolean, optional): Whether the uploaded image should be publicly accessible.
    *   Defaults to `true`.
    *   Note: For Cloudflare R2, public access is controlled via bucket settings.
*   `overwrite` (boolean, optional): Whether to overwrite existing files with the same name.
    *   Defaults to `false`.
*   `tags` (array of strings, optional): Tags to associate with the uploaded image.
    *   Example: `["profile-pic", "user-upload"]`
    *   Note: Not supported by Cloudflare R2.
*   `metadata` (object, optional): Additional metadata to store with the image.
    *   Example: `{"userId": "123", "uploadType": "profile"}`

**Environment Variables for S3:**

```bash
# AWS S3
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export S3_BUCKET=your-bucket-name
export S3_REGION=us-east-1

# Or alternative naming
export S3_ACCESS_KEY=your-access-key
export S3_SECRET_KEY=your-secret-key
export S3_ENDPOINT=https://custom-s3-endpoint.com  # Optional for S3-compatible services
```

**Environment Variables for Cloudflare R2:**

```bash
export CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
export CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
export CLOUDFLARE_R2_BUCKET=your-bucket-name
export CLOUDFLARE_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
export CLOUDFLARE_R2_REGION=auto  # Optional, defaults to 'auto'

# Or alternative naming
export CF_ACCESS_KEY=your-access-key
export CF_SECRET_KEY=your-secret-key
export CF_BUCKET=your-bucket-name
export CF_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

**Set default service:**

```bash
export UPLOAD_SERVICE=s3        # or 'cloudflare'
```

**Features:**

Both services support:
- ✅ File upload from local path, URL, or base64 data
- ✅ Custom filename and folder organization
- ✅ Overwrite protection
- ✅ Metadata and tags (where supported)
- ✅ Automatic content-type detection
- ✅ Error handling and validation

**Service-Specific Notes:**

*S3 Service:*
- Supports ACL settings (public-read/private)
- Supports object tagging
- Works with any S3-compatible service (MinIO, DigitalOcean Spaces, etc.)

*Cloudflare R2 Service:*
- Uses S3-compatible API
- Public access controlled via bucket settings or custom domains
- Does not support ACL (use bucket-level permissions instead)
- Requires endpoint URL configuration

## Requirements

- Node.js 18.x or higher
- Sharp image processing library (automatically installed as a dependency)

## License

MIT

## Author

Vuong Ngo @ https://boomlink.ai

## Sponsorship

Sponsored by [BoomLink.ai](https://boomlink.ai)


[![BoomLink.ai Logo](https://boomlink.ai/logo.svg)](https://boomlink.ai)
