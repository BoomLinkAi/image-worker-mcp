#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION } from './version';
import { resizeImageSchema, resizeImageTool } from './tools/sharp.js';
import { uploadImageSchema, uploadImageTool } from './tools/upload.js';

class ImageWorkerMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: 'image-worker-mcp-server',
      version: VERSION,
    });

    this.setupToolHandlers();
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.tool('resize_image', 'Resize and transform images', resizeImageSchema, resizeImageTool);
    this.server.tool('upload_image', 'Upload images to cloud storage services', uploadImageSchema, uploadImageTool);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Image Worker MCP server running on stdio');
  }
}

// Export the server class
export { ImageWorkerMcpServer };
