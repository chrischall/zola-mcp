# Zola MCP Server — Phase 1: Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap project scaffold, ZolaClient with auth, and a working MCP server entrypoint. No domain tools yet — those are added per-session as API endpoints are discovered via DevTools.

**Architecture:** TypeScript ESM, `@modelcontextprotocol/sdk`, `ZolaClient` handles auth (email/password → Bearer token) and all HTTP. MCP entrypoint in `src/index.ts` registers tools from domain files (none yet). Each domain gets its own tool file in future sessions after DevTools endpoint capture.

**Tech Stack:** TypeScript 5, `@modelcontextprotocol/sdk ^1.27.1`, `dotenv`, `vitest`, `esbuild`, Node.js ESM

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | deps, build scripts |
| `tsconfig.json` | TypeScript ESM config |
| `vitest.config.ts` | test runner config |
| `.env.example` | credential template |
| `.gitignore` | exclude dist, .env, node_modules |
| `src/client.ts` | `ZolaClient` — auth, token mgmt, `request()` |
| `src/index.ts` | MCP server entrypoint, tool registration |
| `tests/client.test.ts` | unit tests for `ZolaClient` |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

```bash
cd ~/git/zola-mcp
git init
```

Expected: `Initialized empty Git repository in .../zola-mcp/.git/`

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "zola-mcp",
  "version": "0.1.0",
  "description": "Zola wedding MCP server for Claude",
  "author": "Claude Sonnet 4.6 (AI) <https://www.anthropic.com/claude>",
  "type": "module",
  "bin": {
    "zola-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc && npm run bundle",
    "bundle": "esbuild src/index.ts --bundle --platform=node --format=esm --external:dotenv --outfile=dist/bundle.js",
    "dev": "node --env-file=.env dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.1",
    "dotenv": "^17.3.1"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "@vitest/coverage-v8": "^4.1.0",
    "esbuild": "^0.27.4",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { provider: 'v8' },
  },
});
```

- [ ] **Step 5: Create `.env.example`**

```
ZOLA_EMAIL=your@email.com
ZOLA_PASSWORD=yourpassword
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
coverage/
```

- [ ] **Step 7: Create `src/` and `tests/` directories**

```bash
mkdir -p src/tools tests
```

- [ ] **Step 8: Install dependencies**

```bash
npm install
```

Expected: `added N packages` with no errors.

- [ ] **Step 9: Initial commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example .gitignore
git commit -m "chore: project scaffold"
```

---

## Task 2: Capture Zola auth flow via DevTools

No code in this task — it's the prerequisite for Task 3. The three constants at the top of `src/client.ts` are filled in from what you capture here.

- [ ] **Step 1: Prepare DevTools**

1. Open Chrome
2. Navigate to `https://www.zola.com`
3. Open DevTools → **Network** tab
4. Enable **Preserve log**
5. Filter by **Fetch/XHR**
6. If you're already logged in, log out first

- [ ] **Step 2: Log in and capture the login request**

1. Submit your Zola login credentials
2. In DevTools, find the POST request that returns your auth token (likely to a path like `/web-api/v1/auth/login` or `/web-api/v1/login`)
3. Note all of the following:
   - **Full URL path** (everything after `https://www.zola.com`)
   - **Request body** — the JSON field names sent (e.g. `{"email": "...", "password": "..."}` or `{"username": "...", "password": "..."}`)
   - **Response body** — the field name holding the auth token (e.g. `token`, `auth`, `accessToken`, `jwt`)
   - **Any custom request headers** beyond `Content-Type: application/json`

- [ ] **Step 3: Capture one authenticated request**

After login, click through to any page (e.g. your registry). In DevTools, click any `/web-api/v1/...` request and check:
   - Is auth sent as `Authorization: Bearer <token>`? Or as a cookie?
   - Are there any extra required headers on authenticated requests?

- [ ] **Step 4: Share captured data**

Paste the captured request/response details into the conversation. Task 3 uses this data to fill in the three client constants.

---

## Task 3: ZolaClient with auth

**Files:**
- Create: `src/client.ts`
- Create: `tests/client.test.ts`

> **Prerequisite:** Task 2 must be complete. Before writing `src/client.ts`, fill in `LOGIN_PATH`, `LOGIN_BODY`, and `TOKEN_FIELD` from the DevTools capture. Also update the login mock response in the test to use the actual token field name.

- [ ] **Step 1: Write failing tests**

Create `tests/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZolaClient } from '../src/client.js';

function makeFetchResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    headers: new Headers(),
    text: async () => text,
    json: async () => body,
  } as unknown as Response;
}

describe('ZolaClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    process.env.ZOLA_EMAIL = 'test@example.com';
    process.env.ZOLA_PASSWORD = 'testpassword';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws when credentials are missing', async () => {
    delete process.env.ZOLA_EMAIL;
    delete process.env.ZOLA_PASSWORD;
    const client = new ZolaClient();
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'ZOLA_EMAIL and ZOLA_PASSWORD must be set'
    );
  });

  it('logs in and attaches Bearer token to requests', async () => {
    // NOTE: update `{ token: 'abc123' }` to use the actual token field name from DevTools
    fetchMock.mockResolvedValueOnce(makeFetchResponse({ token: 'abc123' }));
    fetchMock.mockResolvedValueOnce(makeFetchResponse({ data: 'ok' }));

    const client = new ZolaClient();
    await client.request('GET', '/web-api/v1/test');

    const [, actualRequest] = fetchMock.mock.calls;
    expect((actualRequest[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer abc123',
    });
  });

  it('re-authenticates on 401 and retries', async () => {
    fetchMock.mockResolvedValueOnce(makeFetchResponse({ token: 'first-token' }));
    fetchMock.mockResolvedValueOnce(makeFetchResponse({}, 401));
    fetchMock.mockResolvedValueOnce(makeFetchResponse({ token: 'new-token' }));
    fetchMock.mockResolvedValueOnce(makeFetchResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.request<{ data: string }>('GET', '/web-api/v1/test');
    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws on 429 after one retry', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    fetchMock.mockResolvedValueOnce(makeFetchResponse({ token: 'tok' }));
    fetchMock.mockResolvedValue(makeFetchResponse({}, 429));

    const client = new ZolaClient();
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'Rate limited by Zola API'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: Fails with `Cannot find module '../src/client.js'`

- [ ] **Step 3: Implement `src/client.ts`**

Fill in `LOGIN_PATH`, `LOGIN_BODY`, and `TOKEN_FIELD` from the DevTools capture before saving:

```typescript
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

try {
  const { config } = await import('dotenv');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  config({ path: join(__dirname, '..', '.env'), override: false });
} catch {
  // bundled mode — rely on process.env
}

const BASE_URL = 'https://www.zola.com';

// Fill these in from the DevTools capture in Task 2:
const LOGIN_PATH = '/web-api/v1/auth/login'; // exact path from captured POST request
const LOGIN_BODY = (email: string, password: string): Record<string, string> =>
  ({ email, password }); // exact field names from captured request body
const TOKEN_FIELD = 'token'; // field name in login response containing the auth token

export class ZolaClient {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureAuthenticated();
    return this.doRequest<T>(method, path, body, false);
  }

  private async doRequest<T>(
    method: string,
    path: string,
    body: unknown,
    isRetry: boolean
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token!}`,
    };

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 401 && !isRetry) {
      this.token = null;
      this.tokenExpiry = null;
      await this.ensureAuthenticated();
      return this.doRequest<T>(method, path, body, true);
    }

    if (response.status === 429) {
      if (!isRetry) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        return this.doRequest<T>(method, path, body, true);
      }
      throw new Error('Rate limited by Zola API');
    }

    if (!response.ok) {
      throw new Error(
        `Zola API error: ${response.status} ${response.statusText} for ${method} ${path}`
      );
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.isTokenExpiredSoon()) return;
    await this.login();
  }

  private async login(): Promise<void> {
    const email = process.env.ZOLA_EMAIL;
    const password = process.env.ZOLA_PASSWORD;
    if (!email || !password) {
      throw new Error('ZOLA_EMAIL and ZOLA_PASSWORD must be set');
    }

    const response = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(LOGIN_BODY(email, password)),
    });

    if (!response.ok) {
      throw new Error(`Zola login failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const tokenValue = data[TOKEN_FIELD];
    if (typeof tokenValue !== 'string') {
      throw new Error(`Zola login response missing token field "${TOKEN_FIELD}"`);
    }
    this.token = tokenValue;
    this.tokenExpiry = new Date(Date.now() + 6 * 60 * 60 * 1000);
  }

  private isTokenExpiredSoon(): boolean {
    if (!this.token || !this.tokenExpiry) return true;
    return this.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000;
  }
}

export const client = new ZolaClient();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: 4 tests pass. If the token field name from DevTools differs from `'token'`, update `TOKEN_FIELD` in `client.ts` and the mock `{ token: 'abc123' }` in the test to match.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts tests/client.test.ts
git commit -m "feat: ZolaClient with auth, retry-on-401, retry-on-429"
```

---

## Task 4: MCP server entrypoint

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'zola-mcp',
  version: '0.1.0',
});

// Domain tool registrations are added here as each domain is built.
// Example (future): registerRegistryTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: No TypeScript errors. `dist/index.js` and `dist/bundle.js` created.

- [ ] **Step 3: Verify server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | node dist/index.js
```

Expected: JSON response like `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"zola-mcp","version":"0.1.0"}}}`. Ctrl+C to exit.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: MCP server entrypoint"
```

---

## Next Steps (future sessions)

Domain tools are added per session. For each domain (registry, guests, checklist, seating, website):

1. Open Zola with DevTools Network tab open (Preserve log, Fetch/XHR filter)
2. Navigate through the domain — view items, make a change, undo it
3. Capture all requests to `/web-api/v1/...` for that domain (URL, method, headers, body, response shape)
4. Share them in the conversation — a new task will be planned for those tools

Each domain will produce:
- `src/tools/<domain>.ts` — MCP tool definitions
- `tests/<domain>.test.ts` — unit tests with mocked `client`
- A `register<Domain>Tools(server)` export wired into `src/index.ts`
