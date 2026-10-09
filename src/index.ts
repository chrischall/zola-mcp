import { runMcp } from '@chrischall/mcp-utils';
import { client } from './client.js';
import { TOOL_REGISTRARS } from './tools/index.js';

const VERSION = '2.1.9'; // x-release-please-version

await runMcp({
  name: 'zola-mcp',
  version: VERSION,
  banner: `zola-mcp ${VERSION} ready`,
  deps: client,
  tools: [...TOOL_REGISTRARS],
});
