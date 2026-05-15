import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeEnvVar } from '../scripts/setup-auth.mjs';

describe('writeEnvVar', () => {
  let tmpDir: string;
  let envPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zola-env-'));
    envPath = path.join(tmpDir, '.env');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the file when it does not exist', () => {
    writeEnvVar(envPath, 'FOO', 'bar');
    expect(fs.readFileSync(envPath, 'utf8')).toBe('FOO=bar\n');
  });

  it('appends the key when it is not already present', () => {
    fs.writeFileSync(envPath, 'OTHER=val\n');
    writeEnvVar(envPath, 'FOO', 'bar');
    expect(fs.readFileSync(envPath, 'utf8')).toBe('OTHER=val\nFOO=bar\n');
  });

  it('ensures a trailing newline before appending', () => {
    fs.writeFileSync(envPath, 'OTHER=val'); // no trailing newline
    writeEnvVar(envPath, 'FOO', 'bar');
    expect(fs.readFileSync(envPath, 'utf8')).toBe('OTHER=val\nFOO=bar\n');
  });

  it('replaces an existing value in place', () => {
    fs.writeFileSync(envPath, 'FOO=old\nOTHER=val\n');
    writeEnvVar(envPath, 'FOO', 'new');
    expect(fs.readFileSync(envPath, 'utf8')).toBe('FOO=new\nOTHER=val\n');
  });

  it('only replaces the exact key, not substrings', () => {
    fs.writeFileSync(envPath, 'FOO_BAR=original\nFOO=old\n');
    writeEnvVar(envPath, 'FOO', 'new');
    expect(fs.readFileSync(envPath, 'utf8')).toBe('FOO_BAR=original\nFOO=new\n');
  });

  it('writes with 0600 permissions (owner read/write only)', () => {
    writeEnvVar(envPath, 'FOO', 'bar');
    const mode = fs.statSync(envPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
