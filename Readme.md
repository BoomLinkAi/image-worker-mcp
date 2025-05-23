# @boomlinkai/image-worker-mcp

A command-line tool that provides an MCP server for image resizing.

## Sponsorship

Sponsored by [BoomLink.ai](https://boomlink.ai) - AI-powered solutions for modern development.

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
- Convert images between formats (JPEG, PNG, WebP, AVIF)
- Optimize images for web use
- Apply basic transformations (rotate, flip, etc.)

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
    *   Values: `centre`, `center`, `north`, `east`, `south`, `west`, `northeast`, `southeast`, `southwest`, `northwest`.
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

## Requirements

- Node.js 18.x or higher
- Sharp image processing library (automatically installed as a dependency)

## License

MIT

## Author

Vuong Ngo @ https://boomlink.ai
