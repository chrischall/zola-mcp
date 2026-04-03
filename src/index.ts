import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerVendorTools } from './tools/vendors.js';

const server = new McpServer({
  name: 'zola-mcp',
  version: '0.1.0',
});

registerVendorTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
