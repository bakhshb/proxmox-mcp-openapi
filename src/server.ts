import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as api from "./mcp/tools/api.js";
import * as apiSchema from "./mcp/tools/apiSchema.js";
import * as executeCommand from "./mcp/tools/executeCommand.js";
import * as executeVmCommand from "./mcp/tools/executeVmCommand.js";

export function createServer() {
  const server = new McpServer({
    name: "proxmox",
    version: "1.0.0",
  });

  server.tool(
    api.name,
    api.description,
    api.schema,
    api.annotations,
    api.handler
  );

  server.tool(
    apiSchema.name,
    apiSchema.description,
    apiSchema.schema,
    apiSchema.annotations,
    apiSchema.handler
  );

  server.tool(
    executeCommand.name,
    executeCommand.description,
    executeCommand.schema,
    executeCommand.annotations,
    executeCommand.handler
  );

  server.tool(
    executeVmCommand.name,
    executeVmCommand.description,
    executeVmCommand.schema,
    executeVmCommand.annotations,
    executeVmCommand.handler
  );

  return server;
}
