// Invariant: every shipped manifest that describes the browser-extension
// fallback names it "ContextMint Bridge" — the fetchproxy extension's current
// name — never the old "fetchproxy browser extension" wording. server.json
// drifted from manifest.json once (auto-review follow-up #252); this keeps the
// user-facing install hint consistent across every registry listing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

type EnvVar = { name: string; description?: string };

function serverJsonEnvDescription(): string {
  const json = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf8')) as {
    packages: { environmentVariables?: EnvVar[] }[];
  };
  const vars = json.packages.flatMap((p) => p.environmentVariables ?? []);
  const v = vars.find((e) => e.name === 'ZOLA_REFRESH_TOKEN');
  if (!v?.description) throw new Error('server.json: ZOLA_REFRESH_TOKEN description missing');
  return v.description;
}

function manifestEnvDescription(): string {
  const json = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as {
    user_config?: Record<string, { description?: string }>;
  };
  const entry = Object.values(json.user_config ?? {}).find((c) =>
    c.description?.includes('refresh token'),
  );
  if (!entry?.description) throw new Error('manifest.json: refresh token description missing');
  return entry.description;
}

describe('extension naming in shipped manifests', () => {
  it.each([
    ['server.json', serverJsonEnvDescription],
    ['manifest.json', manifestEnvDescription],
  ])('%s names ContextMint Bridge, not the old fetchproxy extension name', (_file, read) => {
    const description = read();
    expect(description).toContain('ContextMint Bridge');
    expect(description).not.toMatch(/fetchproxy browser extension/i);
  });
});
