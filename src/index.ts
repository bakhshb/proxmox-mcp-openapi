#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("MCP-Entry");

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Proxmox MCP server running via stdio");
}

main().catch((error: unknown) => {
  logger.error("Fatal error occurred", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
