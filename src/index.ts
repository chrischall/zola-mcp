import { runMcp } from '@chrischall/mcp-utils';
import { client } from './client.js';
import { TOOL_REGISTRARS } from './tools/index.js';
import { SERVER_NAME, VERSION } from './version.js';

await runMcp({
  name: SERVER_NAME,
  version: VERSION,
  banner: `${SERVER_NAME} ${VERSION} ready`,
  deps: client,
  tools: [...TOOL_REGISTRARS],
});
