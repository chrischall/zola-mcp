// Invariant: the human-facing tool docs (README.md "Available tools" and the
// Claude Code skill) describe the tools the server actually serves, and the
// README's Permission column is truthful about which writes the SERVER gates.
// manifest-sync guards manifest.json the same way; fleet-audit #1362 found the
// README at "27 tools" and the skill at "31" while 77 were served.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/server';
import { client } from '../src/client.js';
import { TOOL_REGISTRARS } from '../src/tools/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Registered {
  name: string;
  readOnly: boolean;
  /** Takes a confirmToken, i.e. the server itself gates it (src/tools/_confirm.ts). */
  gated: boolean;
}

function registered(): Registered[] {
  const out: Registered[] = [];
  const server = {
    registerTool: (
      name: string,
      cfg: { annotations?: { readOnlyHint?: boolean }; inputSchema?: { shape?: Record<string, unknown> } }
    ) => {
      out.push({
        name,
        readOnly: cfg.annotations?.readOnlyHint === true,
        gated: 'confirmToken' in (cfg.inputSchema?.shape ?? {}),
      });
    },
  } as unknown as McpServer;
  for (const register of TOOL_REGISTRARS) register(server, client);
  return out;
}

const tools = registered();
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const skill = readFileSync(join(ROOT, 'skills/zola/SKILL.md'), 'utf8');
const section = readme.slice(readme.indexOf('## Available tools'), readme.indexOf('## Troubleshooting'));

/** `| \`name\` | what | Permission |` rows of the README tool tables. */
function readmeRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const m of section.matchAll(/^\| `([a-z_]+)` \|.*\| ([^|]+) \|$/gm)) rows.set(m[1], m[2].trim());
  return rows;
}

describe('README tool tables', () => {
  const rows = readmeRows();

  it('states the served tool count', () => {
    expect(section).toContain(`${tools.length} tools`);
  });

  it('has exactly one row per registered tool', () => {
    expect([...rows.keys()].sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it('marks reads Auto, server-gated writes "Server gate", and the rest "Host prompt"', () => {
    const wrong = tools.filter((t) => {
      const want = t.readOnly ? 'Auto' : t.gated ? 'Server gate' : 'Host prompt';
      return rows.get(t.name) !== want;
    });
    expect(wrong.map((t) => `${t.name}: ${rows.get(t.name)}`)).toEqual([]);
  });

  it('names every server-gated write in the gate paragraph', () => {
    for (const t of tools.filter((x) => x.gated)) expect(section, t.name).toContain(`\`${t.name}\``);
  });
});

describe('skills/zola/SKILL.md', () => {
  it('states the served tool count', () => {
    expect(skill).toContain(`${tools.length} tools`);
  });

  it('lists every registered tool', () => {
    const listed = new Set([...skill.matchAll(/^- `([a-z_]+)`/gm)].map((m) => m[1]));
    expect(tools.map((t) => t.name).filter((n) => !listed.has(n))).toEqual([]);
    expect([...listed].filter((n) => !tools.some((t) => t.name === n))).toEqual([]);
  });
});
