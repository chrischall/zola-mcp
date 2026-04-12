import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'zola-mcp',
  version: '0.3.1',
});

// Domain tool registrations are added here as each domain is built.
// Example (future): registerRegistryTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
