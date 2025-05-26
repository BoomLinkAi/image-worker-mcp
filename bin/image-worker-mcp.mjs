#!/usr/bin/env node
import { program } from 'commander';
import { VERSION, ImageWorkerMcpServer } from '../dist/index.mjs';

const init = () => {
  program
    .name('image-worker-mcp')
    .version(VERSION)
    .description('MCP server for image processing and uploading')
    .action(() => {
      const server = new ImageWorkerMcpServer();
      server.run().catch(() => process.exit(1));
    });

  program.parse(process.argv);
};

init();
