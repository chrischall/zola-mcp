import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerVendorTools } from './tools/vendors.js';
import { registerBudgetTools } from './tools/budget.js';
import { registerGuestTools } from './tools/guests.js';
import { registerSeatingTools } from './tools/seating.js';
import { registerInquiryTools } from './tools/inquiries.js';
import { registerEventTools } from './tools/events.js';
import { registerDiscoverTools } from './tools/discover.js';

const server = new McpServer({
  name: 'zola-mcp',
  version: '1.0.3',
});

registerVendorTools(server);
registerBudgetTools(server);
registerGuestTools(server);
registerSeatingTools(server);
registerInquiryTools(server);
registerEventTools(server);
registerDiscoverTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
