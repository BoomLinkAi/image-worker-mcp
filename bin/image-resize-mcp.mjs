#!/usr/bin/env node
import { program } from 'commander';
import { VERSION, ImageResizeMcpServer } from '../dist/index.mjs';

const init = () => {
  program
    .name('image-resize-mcp')
    .version(VERSION)
    .description('MCP server for image resizing')
    .action(() => {
      const server = new ImageResizeMcpServer();
      server.run().catch(() => process.exit(1));
    });

  program.parse(process.argv);
};

init();
