// Invariant: manifest.json's `tools` lists exactly the tools the server
// registers. The manifest feeds the .mcpb bundle and any hosted allowlist or
// catalogue built from it; a tool missing there is silently invisible
// (fleet-audit #1149: 29 listed while ~72 were registered).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/server';
import { client } from '../src/client.js';
import { TOOL_REGISTRARS } from '../src/tools/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function registeredToolNames(): string[] {
  const names: string[] = [];
  const server = {
    registerTool: (name: string) => {
      names.push(name);
    },
  } as unknown as McpServer;
  for (const register of TOOL_REGISTRARS) register(server, client);
  return names.sort();
}

describe('manifest.json tools', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as {
    tools: { name: string; description: string }[];
  };

  it('lists exactly the registered tools', () => {
    expect(manifest.tools.map((t) => t.name).sort()).toEqual(registeredToolNames());
  });

  it('gives every tool a non-empty description', () => {
    for (const t of manifest.tools) expect(t.description, t.name).toMatch(/\S/);
  });
});
