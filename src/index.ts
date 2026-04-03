import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerVendorTools } from './tools/vendors.js';
import { registerBudgetTools } from './tools/budget.js';
import { registerGuestTools } from './tools/guests.js';

const server = new McpServer({
  name: 'zola-mcp',
  version: '0.1.0',
});

registerVendorTools(server);
registerBudgetTools(server);
registerGuestTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
