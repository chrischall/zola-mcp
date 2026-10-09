// Invariant: .claude-plugin/plugin.json declares its MCP config under the
// `mcpServers` key Claude Code actually reads, and the file it points at exists.
//
// Why this exists: the manifest used `"mcp": "./.mcp.json"`. Claude Code
// ignores an unknown `mcp` key (`claude plugin validate` warns "Unknown field
// 'mcp'"); it only worked because ./.mcp.json is the default location anyway.
// Repos that copied the pattern with a non-default path shipped broken plugins.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('plugin manifest', () => {
  it('declares the MCP config under `mcpServers`, not the ignored `mcp` key', () => {
    expect(manifest).not.toHaveProperty('mcp');
    expect(manifest.mcpServers).toBe('./.mcp.json');
  });

  it('points `mcpServers` at a file that exists', () => {
    expect(typeof manifest.mcpServers).toBe('string');
    expect(existsSync(join(ROOT, manifest.mcpServers as string))).toBe(true);
  });
});
