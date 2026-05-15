# Website Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 18 MCP tools exposing the Zola wedding-website editing surface (site settings, page structure, home sections, FAQs, points-of-interest) backed by captured iOS-app endpoints.

**Architecture:** Two new tool files (`website.ts`, `website-content.ts`) plus tests, registered in `index.ts`. All HTTP work goes through the existing `client.requestMobile()`. The three content entity types in `website-content.ts` share a unified DELETE endpoint and a cached page-id lookup; otherwise each tool is a thin wrapper around one captured endpoint.

**Tech Stack:** TypeScript, MCP TS SDK (`@modelcontextprotocol/sdk`), `zod` for argument schemas, `vitest` for tests with `vi.spyOn` on the shared `client` singleton.

**Reference:** Spec at `docs/superpowers/specs/2026-05-15-website-editing-design.md`. Existing patterns to follow: `src/tools/events.ts` and `tests/events.test.ts`.

---

## Task 1: Add `weddingId` to client context

The `update_wedding_settings` tool needs the numeric `wedding_id` (distinct from `weddingAccountId`). The `/v3/users/me/context` response already includes `wedding.wedding_id` — we just need to expose it.

**Files:**
- Modify: `src/client.ts`
- Test: `tests/client.test.ts`

- [ ] **Step 1: Read existing client test file**

Run: `cat tests/client.test.ts`
Expected: see how context fetching is tested.

- [ ] **Step 2: Write a failing test for `weddingId` exposure**

Add to `tests/client.test.ts` inside the existing `describe('getContext'` block (or create one if it doesn't exist for this scenario). The test verifies that the context returned from a context API response includes `weddingId`.

```ts
it('getContext: returns weddingId from context response', async () => {
  const freshClient = new (await import('../src/client.js')).ZolaClient();
  vi.spyOn(freshClient, 'requestMobile').mockResolvedValueOnce({
    data: {
      user: { id: 'user-1' },
      wedding_account: { wedding_account_id: 4664323 },
      wedding: { wedding_id: 7585869, wedding_date: '2026-10-17', slug: 'chrismer26' },
      registry: { id: 'registry-1' },
    },
  } as never);
  const ctx = await freshClient.getContext();
  expect(ctx.weddingId).toBe(7585869);
});
```

Note: if `ZolaClient` is not currently exported, this test will fail at import — handle in Step 3.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/client.test.ts`
Expected: FAIL — either `ZolaClient` not exported, or `ctx.weddingId` is undefined.

- [ ] **Step 4: Update `UserContext` interface and `getContext` to include `weddingId`**

In `src/client.ts`:

1. Export the class (find `class ZolaClient` and prepend `export`).

2. Add `weddingId` to `UserContext`:

```ts
export interface UserContext {
  weddingAccountId: number;
  weddingId: number;
  registryId: string;
  userId: string;
  weddingDate: string | null;
  weddingSlug: string | null;
}
```

3. Add `wedding_id` to the response type in `getContext()` and populate `weddingId`. The relevant section becomes:

```ts
const response = await this.requestMobile<{
  data: {
    user: { id: string };
    wedding_account: { wedding_account_id: number };
    wedding: { wedding_id: number; wedding_date: string | null; slug: string | null };
    registry: { id: string };
  };
}>('GET', '/v3/users/me/context');

this.cachedContext = {
  weddingAccountId: Number(envAccountId) || response.data.wedding_account.wedding_account_id,
  weddingId: response.data.wedding.wedding_id,
  registryId: envRegistryId || response.data.registry.id,
  userId: response.data.user.id,
  weddingDate: response.data.wedding.wedding_date,
  weddingSlug: response.data.wedding.slug,
};
return this.cachedContext;
```

4. Update the env-only short-circuit branch to also set `weddingId` (since callers may rely on it). Add `ZOLA_WEDDING_ID` env override; if not set, the short-circuit is no longer sufficient and the API call must happen. Modified branch:

```ts
const envAccountId = process.env.ZOLA_ACCOUNT_ID;
const envRegistryId = process.env.ZOLA_REGISTRY_ID;
const envWeddingId = process.env.ZOLA_WEDDING_ID;

if (envAccountId && envRegistryId && envWeddingId) {
  this.cachedContext = {
    weddingAccountId: Number(envAccountId),
    weddingId: Number(envWeddingId),
    registryId: envRegistryId,
    userId: '',
    weddingDate: null,
    weddingSlug: null,
  };
  return this.cachedContext;
}
```

And in the API-call branch (after the response is received), allow env override for `weddingId` too:

```ts
weddingId: Number(envWeddingId) || response.data.wedding.wedding_id,
```

- [ ] **Step 5: Fix existing test mocks that construct a `UserContext`**

Run: `grep -rn "getContext.*mockResolvedValue\|weddingAccountId:" tests/`
Expected: list of test files that mock `getContext` — each needs `weddingId` added.

For each match, add `weddingId: 7585869,` to the mocked context object. Example:

```ts
vi.spyOn(client, 'getContext').mockResolvedValue({
  weddingAccountId: 4664323,
  weddingId: 7585869,
  registryId: 'registry-id-1',
  userId: 'user-id-1',
  weddingDate: '2026-10-17',
  weddingSlug: 'chrismer26',
});
```

- [ ] **Step 6: Run full test suite to verify all green**

Run: `npm test`
Expected: PASS for all existing tests + new client test.

- [ ] **Step 7: Commit**

```bash
git add src/client.ts tests/
git commit -m "feat(client): expose wedding_id in UserContext

Captured wedding_id from /v3/users/me/context (distinct from
wedding_account_id). Needed for upcoming website editing tools
that PUT /v3/weddings/{wedding_id}."
```

---

## Task 2: Scaffold `website.ts` with `list_pages` (read-only, simplest endpoint)

Start with the easiest tool to exercise the file structure and verify everything wires up. `list_pages` has no args and one GET call.

**Files:**
- Create: `src/tools/website.ts`
- Create: `tests/website.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/website.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listPages } from '../src/tools/website.js';

const MOCK_CTX = {
  weddingAccountId: 4664323,
  weddingId: 7585869,
  registryId: 'registry-1',
  userId: 'user-1',
  weddingDate: '2026-10-17',
  weddingSlug: 'chrismer26',
};

const MOCK_PAGES_RESPONSE = {
  data: {
    theme_v2: { theme_key: 'blake-cranberry' },
    home_page: { page_id: 41938915, type: 'HOME', hidden: false, display_order: 0 },
    faq_page: { page_id: 41938921, type: 'FAQ', hidden: false, display_order: 7 },
    poi_page: { page_id: 41938922, type: 'POI', hidden: false, display_order: 6 },
    travel_page: { page_id: 41938918, type: 'TRAVEL', hidden: false, display_order: 1 },
    event_page: { page_id: 41938917, type: 'EVENT', hidden: false, display_order: 2 },
    photos_page: { page_id: 41938919, type: 'PHOTOS', hidden: true, display_order: 4 },
    rsvp_page: { page_id: 41938920, type: 'RSVP', hidden: false, display_order: 3 },
    wedding_party_page: { page_id: 41938916, type: 'WEDDING_PARTY', hidden: false, display_order: 8 },
    registry_page: { page_id: 41938923, type: 'REGISTRY', hidden: false, display_order: 5 },
    ordered_page_ids: [41938915, 41938918, 41938917, 41938920, 41938919, 41938923, 41938922, 41938921, 41938916],
  },
};

describe('website tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listPages: GETs pages/wedding-accounts/full and returns the data object', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    const result = await listPages();
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/pages/wedding-accounts/full');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.faq_page.page_id).toBe(41938921);
    expect(parsed.ordered_page_ids).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/website.test.ts`
Expected: FAIL — module `../src/tools/website.js` not found.

- [ ] **Step 3: Create `src/tools/website.ts` with the minimum to pass**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

export async function listPages(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v3/websites/pages/wedding-accounts/full'
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export function registerWebsiteTools(server: McpServer): void {
  server.tool(
    'list_pages',
    'List all wedding-website pages with their IDs, types, display order, visibility, and theme info',
    {},
    listPages
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/website.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website.ts tests/website.test.ts
git commit -m "feat(website): add list_pages tool"
```

---

## Task 3: Add `set_page_hidden` and `reorder_pages`

Both are simple PUTs against fixed endpoints — no merge logic required.

**Files:**
- Modify: `src/tools/website.ts`
- Modify: `tests/website.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/website.test.ts` inside the `describe('website tools'` block:

```ts
  it('setPageHidden: PUTs hidden flag and returns response data', async () => {
    reqSpy.mockResolvedValueOnce({ data: { page_id: 41938920, hidden: true } } as never);
    const result = await setPageHidden({ page_id: 41938920, hidden: true });
    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/websites/pages/41938920/hidden/true');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hidden).toBe(true);
  });

  it('reorderPages: PUTs ids array against the wedding-accounts reorder endpoint', async () => {
    const newOrder = [41938915, 41938918, 41938917];
    reqSpy.mockResolvedValueOnce({ data: [] } as never);
    const result = await reorderPages({ page_ids: newOrder });
    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/websites/pages/wedding-accounts/4664323/reorder',
      { ids: newOrder }
    );
    expect(result.content[0].text).toBeDefined();
  });
```

Also update the import line at the top of the test file:

```ts
import { listPages, setPageHidden, reorderPages } from '../src/tools/website.js';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/website.test.ts`
Expected: FAIL — `setPageHidden` and `reorderPages` not exported.

- [ ] **Step 3: Implement both tools**

Append to `src/tools/website.ts` (before `registerWebsiteTools`):

```ts
export async function setPageHidden(args: {
  page_id: number;
  hidden: boolean;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/pages/${args.page_id}/hidden/${args.hidden}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function reorderPages(args: { page_ids: number[] }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/pages/wedding-accounts/${weddingAccountId}/reorder`,
    { ids: args.page_ids }
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}
```

Update `registerWebsiteTools` to register them:

```ts
export function registerWebsiteTools(server: McpServer): void {
  server.tool(
    'list_pages',
    'List all wedding-website pages with their IDs, types, display order, visibility, and theme info',
    {},
    listPages
  );

  server.tool(
    'set_page_hidden',
    'Show or hide a page on the wedding website (e.g., hide the RSVP page until invites go out)',
    {
      page_id: z.number().describe('Page ID from list_pages'),
      hidden: z.boolean().describe('true to hide the page, false to show it'),
    },
    setPageHidden
  );

  server.tool(
    'reorder_pages',
    'Reorder pages in the website navigation. Pass the complete ordered list of page IDs.',
    {
      page_ids: z.array(z.number()).describe('Full ordered list of page IDs in desired nav order'),
    },
    reorderPages
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/website.test.ts`
Expected: PASS for all three website tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website.ts tests/website.test.ts
git commit -m "feat(website): add set_page_hidden and reorder_pages tools"
```

---

## Task 4: Add `update_page` (per-page metadata + customization)

Updates per-page fields like title, intro_copy, customization options. The captured PUT body for `pages-v2` includes a `customization` object — we accept it as a passthrough.

**Files:**
- Modify: `src/tools/website.ts`
- Modify: `tests/website.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/website.test.ts`:

```ts
  it('updatePage: PUTs partial fields to pages-v2/{id}', async () => {
    reqSpy.mockResolvedValueOnce({ data: { page_id: 41938922, title: 'Things To Do' } } as never);
    const result = await updatePage({
      page_id: 41938922,
      title: 'Things To Do',
      intro_copy: 'Stuff to see and do nearby.',
    });
    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/websites/pages-v2/41938922',
      expect.objectContaining({
        page_id: 41938922,
        title: 'Things To Do',
        intro_copy: 'Stuff to see and do nearby.',
      })
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.title).toBe('Things To Do');
  });

  it('updatePage: omits undefined fields from the request body', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updatePage({ page_id: 41938922, title: 'Just title' });
    const callBody = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(callBody.title).toBe('Just title');
    expect(callBody).not.toHaveProperty('intro_copy');
    expect(callBody).not.toHaveProperty('description');
  });
```

Update the import line:

```ts
import { listPages, setPageHidden, reorderPages, updatePage } from '../src/tools/website.js';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/website.test.ts`
Expected: FAIL — `updatePage` not exported.

- [ ] **Step 3: Implement `updatePage`**

Append to `src/tools/website.ts` before `registerWebsiteTools`:

```ts
export async function updatePage(args: {
  page_id: number;
  title?: string;
  nav_title?: string;
  menu_title?: string;
  intro_copy?: string;
  description?: string;
  hidden?: boolean;
  customization?: unknown;
}): Promise<ToolResult> {
  const body: Record<string, unknown> = { page_id: args.page_id };
  if (args.title !== undefined) body.title = args.title;
  if (args.nav_title !== undefined) body.nav_title = args.nav_title;
  if (args.menu_title !== undefined) body.menu_title = args.menu_title;
  if (args.intro_copy !== undefined) body.intro_copy = args.intro_copy;
  if (args.description !== undefined) body.description = args.description;
  if (args.hidden !== undefined) body.hidden = args.hidden;
  if (args.customization !== undefined) body.customization = args.customization;

  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/pages-v2/${args.page_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}
```

Register inside `registerWebsiteTools` (add before the closing brace):

```ts
  server.tool(
    'update_page',
    'Update page-level metadata (title, intro copy, nav title, visibility, layout customization)',
    {
      page_id: z.number().describe('Page ID from list_pages'),
      title: z.string().optional().describe('On-page title'),
      nav_title: z.string().optional().describe('Title shown in nav bar'),
      menu_title: z.string().optional().describe('Title shown in mobile menu'),
      intro_copy: z.string().optional().describe('Introductory paragraph on the page'),
      description: z.string().optional().describe('Page description'),
      hidden: z.boolean().optional().describe('Hide the page from the public site'),
      customization: z.unknown().optional().describe('Layout customization object (see list_pages for shape)'),
    },
    updatePage
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/website.test.ts`
Expected: PASS for all website tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website.ts tests/website.test.ts
git commit -m "feat(website): add update_page tool"
```

---

## Task 5: Add `get_wedding_settings` and `update_wedding_settings`

`get_wedding_settings` reads from the user context endpoint. `update_wedding_settings` fetches current wedding fields fresh from `/v3/users/me/context` (bypassing the cached `getContext`), merges the partial args, then PUTs the full body to `/v3/weddings/{wedding_id}`.

**Files:**
- Modify: `src/tools/website.ts`
- Modify: `tests/website.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/website.test.ts`:

```ts
  const MOCK_CONTEXT_RESPONSE = {
    data: {
      user: { id: 'user-1' },
      wedding_account: { wedding_account_id: 4664323 },
      wedding: {
        wedding_id: 7585869,
        account_id: 7585875,
        slug: 'chrismer26',
        owner_first_name: 'Meredith',
        owner_last_name: 'Suffron',
        partner_first_name: 'Christopher',
        partner_last_name: 'Hall',
        title: 'Meredith & Chris',
        wedding_date: '2026-10-17',
        hashtag: null,
        enable_search_engine: false,
        enable_search_zola: false,
        city: 'Charlotte',
        state_province: 'NC',
        guest_count: 100,
      },
      registry: { id: 'registry-1' },
    },
  };

  it('getWeddingSettings: GETs /v3/users/me/context and returns wedding object', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_CONTEXT_RESPONSE as never);
    const result = await getWeddingSettings();
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/users/me/context');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.title).toBe('Meredith & Chris');
    expect(parsed.slug).toBe('chrismer26');
    expect(parsed.wedding_id).toBe(7585869);
  });

  it('updateWeddingSettings: GETs current wedding, merges args, PUTs to /v3/weddings/{id}', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_CONTEXT_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({
      data: { ...MOCK_CONTEXT_RESPONSE.data.wedding, title: 'New Title' },
    } as never);

    const result = await updateWeddingSettings({ title: 'New Title', hashtag: '#mer-chris' });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'GET', '/v3/users/me/context');
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      '/v3/weddings/7585869',
      expect.objectContaining({
        wedding_id: 7585869,
        account_id: 7585875,
        title: 'New Title',
        hashtag: '#mer-chris',
        slug: 'chrismer26',
        partner_first_name: 'Christopher',
        wedding_date: '2026-10-17',
      })
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.title).toBe('New Title');
  });
```

Update the import line:

```ts
import {
  listPages,
  setPageHidden,
  reorderPages,
  updatePage,
  getWeddingSettings,
  updateWeddingSettings,
} from '../src/tools/website.js';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/website.test.ts`
Expected: FAIL — `getWeddingSettings` and `updateWeddingSettings` not exported.

- [ ] **Step 3: Implement both tools**

Append to `src/tools/website.ts` before `registerWebsiteTools`. First add the wedding-context types and helpers:

```ts
interface WeddingFields {
  wedding_id: number;
  account_id: number;
  slug: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
  title: string;
  wedding_date: string | null;
  hashtag: string | null;
  enable_search_engine: boolean;
  enable_search_zola: boolean;
  city: string | null;
  state_province: string | null;
  guest_count: number | null;
}

interface UserContextResponse {
  data: {
    wedding: WeddingFields;
  };
}

async function fetchWeddingFields(): Promise<WeddingFields> {
  const response = await client.requestMobile<UserContextResponse>('GET', '/v3/users/me/context');
  return response.data.wedding;
}

export async function getWeddingSettings(): Promise<ToolResult> {
  const wedding = await fetchWeddingFields();
  return { content: [{ type: 'text', text: JSON.stringify(wedding, null, 2) }] };
}

export async function updateWeddingSettings(args: {
  title?: string;
  slug?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  partner_first_name?: string;
  partner_last_name?: string;
  wedding_date?: string;
  city?: string;
  state_province?: string;
  hashtag?: string;
  guest_count?: number;
  enable_search_engine?: boolean;
  enable_search_zola?: boolean;
}): Promise<ToolResult> {
  const current = await fetchWeddingFields();
  const body = {
    wedding_id: current.wedding_id,
    account_id: current.account_id,
    slug: args.slug ?? current.slug,
    owner_first_name: args.owner_first_name ?? current.owner_first_name,
    owner_last_name: args.owner_last_name ?? current.owner_last_name,
    partner_first_name: args.partner_first_name ?? current.partner_first_name,
    partner_last_name: args.partner_last_name ?? current.partner_last_name,
    title: args.title ?? current.title,
    wedding_date: args.wedding_date ?? current.wedding_date,
    hashtag: args.hashtag ?? current.hashtag ?? '',
    enable_search_engine: args.enable_search_engine ?? current.enable_search_engine,
    enable_search_zola: args.enable_search_zola ?? current.enable_search_zola,
    city: args.city ?? current.city,
    state_province: args.state_province ?? current.state_province,
    guest_count: args.guest_count ?? current.guest_count,
  };

  const response = await client.requestMobile<MobileEnvelope<WeddingFields>>(
    'PUT',
    `/v3/weddings/${current.wedding_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}
```

Register inside `registerWebsiteTools`:

```ts
  server.tool(
    'get_wedding_settings',
    'Get top-level wedding settings: title, URL slug, partner names, date, city, hashtag, guest count, search visibility',
    {},
    getWeddingSettings
  );

  server.tool(
    'update_wedding_settings',
    'Update top-level wedding settings. Provide only the fields you want to change; the rest are preserved.',
    {
      title: z.string().optional().describe('Wedding title (e.g., "Meredith & Chris")'),
      slug: z.string().optional().describe('URL slug — appears in the public website URL'),
      owner_first_name: z.string().optional(),
      owner_last_name: z.string().optional(),
      partner_first_name: z.string().optional(),
      partner_last_name: z.string().optional(),
      wedding_date: z.string().optional().describe('YYYY-MM-DD'),
      city: z.string().optional(),
      state_province: z.string().optional(),
      hashtag: z.string().optional().describe('e.g. #merchris2026 — empty string clears it'),
      guest_count: z.number().optional(),
      enable_search_engine: z.boolean().optional().describe('Allow search engines (Google, etc.) to index the site'),
      enable_search_zola: z.boolean().optional().describe('Allow Zola search to find the site'),
    },
    updateWeddingSettings
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/website.test.ts`
Expected: PASS for all website tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website.ts tests/website.test.ts
git commit -m "feat(website): add get_wedding_settings and update_wedding_settings"
```

---

## Task 6: Register website tools in `index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the import and registration**

Edit `src/index.ts`. Add the import (alphabetical with siblings):

```ts
import { registerWebsiteTools } from './tools/website.js';
```

Add the registration call alongside the others:

```ts
registerWebsiteTools(server);
```

- [ ] **Step 2: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds with no TS errors.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: register website tools in MCP server"
```

---

## Task 7: Scaffold `website-content.ts` with FAQ CRUD

Start the content file with FAQs (the simplest entity — two free-text fields plus display_order). This task establishes the file's shared helpers; subsequent tasks reuse them for home sections and POIs.

**Files:**
- Create: `src/tools/website-content.ts`
- Create: `tests/website-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/website-content.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  listFaqs,
  addFaq,
  updateFaq,
  removeFaq,
  _resetPageIdCache,
} from '../src/tools/website-content.js';

const MOCK_CTX = {
  weddingAccountId: 4664323,
  weddingId: 7585869,
  registryId: 'registry-1',
  userId: 'user-1',
  weddingDate: '2026-10-17',
  weddingSlug: 'chrismer26',
};

const MOCK_PAGES_RESPONSE = {
  data: {
    home_page: { page_id: 41938915, type: 'HOME' },
    faq_page: { page_id: 41938921, type: 'FAQ' },
    poi_page: { page_id: 41938922, type: 'POI' },
  },
};

describe('website-content: faqs', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
    _resetPageIdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listFaqs: GETs faqs for wedding account', async () => {
    reqSpy.mockResolvedValueOnce({
      data: [
        { faq_entity_id: 6522901, question: 'Q1', answer: 'A1', display_order: 0 },
      ],
    } as never);

    const result = await listFaqs();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/faqs/wedding-accounts/4664323');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question).toBe('Q1');
  });

  it('addFaq: POSTs new FAQ with faq_entity_id=0', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { faq_entity_id: 9999, question: 'New?', answer: 'Yes', display_order: 0 },
    } as never);

    const result = await addFaq({ question: 'New?', answer: 'Yes', display_order: 0 });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/faqs', {
      wedding_account_id: 4664323,
      faq_entity_id: 0,
      question: 'New?',
      answer: 'Yes',
      display_order: 0,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.faq_entity_id).toBe(9999);
  });

  it('updateFaq: PUTs to /faqs/{id} with merged body', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { faq_entity_id: 6522901, question: 'Updated?', answer: 'Updated.', display_order: 3 },
    } as never);

    const result = await updateFaq({
      faq_entity_id: 6522901,
      question: 'Updated?',
      answer: 'Updated.',
      display_order: 3,
    });

    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/websites/faqs/6522901', {
      wedding_account_id: 4664323,
      faq_entity_id: 6522901,
      question: 'Updated?',
      answer: 'Updated.',
      display_order: 3,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.question).toBe('Updated?');
  });

  it('removeFaq: looks up FAQ page_id then DELETEs entity', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never); // pages lookup
    reqSpy.mockResolvedValueOnce({ data: null } as never); // DELETE

    await removeFaq({ faq_entity_id: 6522901 });

    expect(reqSpy).toHaveBeenNthCalledWith(1, 'GET', '/v3/websites/pages/wedding-accounts/full');
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'DELETE',
      '/v3/websites/pages/41938921/entities/6522901/wedding-accounts/4664323'
    );
  });

  it('removeFaq: caches page_id lookup across calls', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never); // pages lookup (once)
    reqSpy.mockResolvedValueOnce({ data: null } as never); // first DELETE
    reqSpy.mockResolvedValueOnce({ data: null } as never); // second DELETE

    await removeFaq({ faq_entity_id: 6522901 });
    await removeFaq({ faq_entity_id: 6522902 });

    expect(reqSpy).toHaveBeenCalledTimes(3);
    const getCalls = reqSpy.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/website-content.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/tools/website-content.ts` with FAQ CRUD and the cached page-id helper**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

type PageType = 'HOME' | 'FAQ' | 'POI';

interface PagesFullResponse {
  data: {
    home_page?: { page_id: number };
    faq_page?: { page_id: number };
    poi_page?: { page_id: number };
  };
}

const pageIdCache = new Map<number, Map<PageType, number>>();

/** Test-only: clear the cache between tests. */
export function _resetPageIdCache(): void {
  pageIdCache.clear();
}

async function getPageId(pageType: PageType): Promise<number> {
  const { weddingAccountId } = await client.getContext();
  let perAccount = pageIdCache.get(weddingAccountId);
  if (!perAccount) {
    perAccount = new Map();
    pageIdCache.set(weddingAccountId, perAccount);
  }
  const cached = perAccount.get(pageType);
  if (cached !== undefined) return cached;

  const response = await client.requestMobile<PagesFullResponse>(
    'GET',
    '/v3/websites/pages/wedding-accounts/full'
  );
  const key = pageType === 'HOME' ? 'home_page' : pageType === 'FAQ' ? 'faq_page' : 'poi_page';
  const page = response.data[key];
  if (!page) {
    throw new Error(`Page of type ${pageType} not found on this wedding`);
  }
  perAccount.set(pageType, page.page_id);
  return page.page_id;
}

async function deletePageEntity(pageType: PageType, entityId: number): Promise<void> {
  const { weddingAccountId } = await client.getContext();
  const pageId = await getPageId(pageType);
  await client.requestMobile<MobileEnvelope<unknown>>(
    'DELETE',
    `/v3/websites/pages/${pageId}/entities/${entityId}/wedding-accounts/${weddingAccountId}`
  );
}

// ===== FAQs =====

export async function listFaqs(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/faqs/wedding-accounts/${weddingAccountId}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addFaq(args: {
  question: string;
  answer: string;
  display_order?: number;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    faq_entity_id: 0,
    question: args.question,
    answer: args.answer,
    display_order: args.display_order ?? 0,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/faqs',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateFaq(args: {
  faq_entity_id: number;
  question: string;
  answer: string;
  display_order: number;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    faq_entity_id: args.faq_entity_id,
    question: args.question,
    answer: args.answer,
    display_order: args.display_order,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/faqs/${args.faq_entity_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeFaq(args: { faq_entity_id: number }): Promise<ToolResult> {
  await deletePageEntity('FAQ', args.faq_entity_id);
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.faq_entity_id }) }] };
}

export function registerWebsiteContentTools(server: McpServer): void {
  server.tool('list_faqs', 'List all FAQs on the wedding website', {}, listFaqs);

  server.tool(
    'add_faq',
    'Add a new FAQ (question + answer) to the website FAQ page',
    {
      question: z.string().describe('The FAQ question'),
      answer: z.string().describe('The FAQ answer'),
      display_order: z.number().optional().describe('Position in the FAQ list (defaults to 0)'),
    },
    addFaq
  );

  server.tool(
    'update_faq',
    'Update an existing FAQ — all three fields (question, answer, display_order) must be supplied',
    {
      faq_entity_id: z.number().describe('FAQ entity ID from list_faqs'),
      question: z.string(),
      answer: z.string(),
      display_order: z.number(),
    },
    updateFaq
  );

  server.tool(
    'remove_faq',
    'Remove an FAQ from the website',
    { faq_entity_id: z.number().describe('FAQ entity ID from list_faqs') },
    removeFaq
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/website-content.test.ts`
Expected: PASS for all 5 FAQ tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website-content.ts tests/website-content.test.ts
git commit -m "feat(website): add FAQ CRUD tools with cached page-id lookup"
```

---

## Task 8: Add home-section CRUD (story blocks)

Same shape as FAQs but different field names: `homepage_entity_id`, `title`, `subtitle`, `description`, `hidden`. PUT also includes `updated_at` and `page_entity_updated_at` (millisecond timestamps).

**Files:**
- Modify: `src/tools/website-content.ts`
- Modify: `tests/website-content.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new describe block to `tests/website-content.test.ts`:

```ts
describe('website-content: home sections', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
    _resetPageIdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listHomeSections: GETs home sections for wedding account', async () => {
    reqSpy.mockResolvedValueOnce({
      data: [
        { homepage_entity_id: 1381564, title: 'Story 1', subtitle: 'sub', description: 'desc', display_order: 0, hidden: false },
      ],
    } as never);

    const result = await listHomeSections();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/home-sections/wedding-accounts/4664323');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].title).toBe('Story 1');
  });

  it('addHomeSection: POSTs new section with homepage_entity_id=0', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { homepage_entity_id: 1422067, title: 'New', subtitle: 'sub', description: 'd', display_order: 2, hidden: false },
    } as never);

    await addHomeSection({
      title: 'New',
      subtitle: 'sub',
      description: 'd',
      display_order: 2,
    });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/home-sections', {
      wedding_account_id: 4664323,
      homepage_entity_id: 0,
      title: 'New',
      subtitle: 'sub',
      description: 'd',
      display_order: 2,
      hidden: false,
    });
  });

  it('updateHomeSection: PUTs to /home-sections/{id}', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { homepage_entity_id: 1381564, title: 'Edited' },
    } as never);

    await updateHomeSection({
      homepage_entity_id: 1381564,
      title: 'Edited',
      subtitle: 'sub',
      description: 'd',
      display_order: 0,
      hidden: false,
    });

    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/websites/home-sections/1381564', {
      wedding_account_id: 4664323,
      homepage_entity_id: 1381564,
      title: 'Edited',
      subtitle: 'sub',
      description: 'd',
      display_order: 0,
      hidden: false,
    });
  });

  it('removeHomeSection: looks up HOME page_id then DELETEs entity', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: null } as never);

    await removeHomeSection({ homepage_entity_id: 1381564 });

    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'DELETE',
      '/v3/websites/pages/41938915/entities/1381564/wedding-accounts/4664323'
    );
  });
});
```

Update the import at the top of the test file:

```ts
import {
  listFaqs,
  addFaq,
  updateFaq,
  removeFaq,
  listHomeSections,
  addHomeSection,
  updateHomeSection,
  removeHomeSection,
  _resetPageIdCache,
} from '../src/tools/website-content.js';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/website-content.test.ts`
Expected: FAIL — home-section functions not exported.

- [ ] **Step 3: Implement home-section CRUD**

Append to `src/tools/website-content.ts` before `registerWebsiteContentTools`:

```ts
// ===== Home page sections (story blocks) =====

export async function listHomeSections(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/home-sections/wedding-accounts/${weddingAccountId}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addHomeSection(args: {
  title: string;
  subtitle: string;
  description: string;
  display_order?: number;
  hidden?: boolean;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    homepage_entity_id: 0,
    title: args.title,
    subtitle: args.subtitle,
    description: args.description,
    display_order: args.display_order ?? 0,
    hidden: args.hidden ?? false,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/home-sections',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateHomeSection(args: {
  homepage_entity_id: number;
  title: string;
  subtitle: string;
  description: string;
  display_order: number;
  hidden: boolean;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    homepage_entity_id: args.homepage_entity_id,
    title: args.title,
    subtitle: args.subtitle,
    description: args.description,
    display_order: args.display_order,
    hidden: args.hidden,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/home-sections/${args.homepage_entity_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeHomeSection(args: { homepage_entity_id: number }): Promise<ToolResult> {
  await deletePageEntity('HOME', args.homepage_entity_id);
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.homepage_entity_id }) }] };
}
```

Register them inside `registerWebsiteContentTools` (before the closing brace):

```ts
  server.tool('list_home_sections', 'List the story sections on the website home page', {}, listHomeSections);

  server.tool(
    'add_home_section',
    'Add a story section to the home page (title + subtitle + description block)',
    {
      title: z.string(),
      subtitle: z.string(),
      description: z.string(),
      display_order: z.number().optional(),
      hidden: z.boolean().optional(),
    },
    addHomeSection
  );

  server.tool(
    'update_home_section',
    'Update a home page story section — all fields must be supplied',
    {
      homepage_entity_id: z.number().describe('Home section ID from list_home_sections'),
      title: z.string(),
      subtitle: z.string(),
      description: z.string(),
      display_order: z.number(),
      hidden: z.boolean(),
    },
    updateHomeSection
  );

  server.tool(
    'remove_home_section',
    'Remove a story section from the home page',
    { homepage_entity_id: z.number() },
    removeHomeSection
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/website-content.test.ts`
Expected: PASS for all content tests so far.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website-content.ts tests/website-content.test.ts
git commit -m "feat(website): add home section CRUD tools"
```

---

## Task 9: Add POI CRUD ("Things to Do")

POIs have many more fields (address, lat/lng, google_place_id, url) but follow the same CRUD shape. Address fields are optional individually (a POI just needs `title` minimally), but the captured payloads include the full address — keep field names matching the API.

**Files:**
- Modify: `src/tools/website-content.ts`
- Modify: `tests/website-content.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new describe block to `tests/website-content.test.ts`:

```ts
describe('website-content: points of interest', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
    _resetPageIdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listPois: GETs points-of-interest for wedding account', async () => {
    reqSpy.mockResolvedValueOnce({
      data: [{ poi_entity_id: 5506041, title: 'Rhino Market' }],
    } as never);

    const result = await listPois();

    expect(reqSpy).toHaveBeenCalledWith(
      'GET',
      '/v3/websites/points-of-interest/wedding-accounts/4664323'
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].title).toBe('Rhino Market');
  });

  it('addPoi: POSTs with poi_entity_id=0 and all provided fields', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { poi_entity_id: 5506041, title: 'Rhino Market' },
    } as never);

    await addPoi({
      title: 'Rhino Market',
      address1: '1414 South Tryon Street',
      city: 'Charlotte',
      state_province: 'NC',
      postal_code: '28203',
      country_code: 'US',
      description: 'Coffee + sandwiches',
      display_order: 0,
      google_place_id: 'ChIJ3VVpfi-fVogRMuoFolGsGQY',
      latitude: '35.2175737',
      longitude: '-80.8555847',
    });

    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/websites/points-of-interest',
      expect.objectContaining({
        wedding_account_id: 4664323,
        poi_entity_id: 0,
        title: 'Rhino Market',
        address1: '1414 South Tryon Street',
        google_place_id: 'ChIJ3VVpfi-fVogRMuoFolGsGQY',
      })
    );
  });

  it('addPoi: omits unset optional fields', async () => {
    reqSpy.mockResolvedValueOnce({ data: { poi_entity_id: 1 } } as never);
    await addPoi({ title: 'Bare POI' });
    const body = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(body.title).toBe('Bare POI');
    expect(body.poi_entity_id).toBe(0);
    expect(body).not.toHaveProperty('google_place_id');
    expect(body).not.toHaveProperty('latitude');
  });

  it('updatePoi: PUTs to /points-of-interest/{id}', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { poi_entity_id: 5506041, title: 'Renamed' },
    } as never);

    await updatePoi({ poi_entity_id: 5506041, title: 'Renamed' });

    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/websites/points-of-interest/5506041',
      expect.objectContaining({
        wedding_account_id: 4664323,
        poi_entity_id: 5506041,
        title: 'Renamed',
      })
    );
  });

  it('removePoi: looks up POI page_id then DELETEs entity', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: null } as never);

    await removePoi({ poi_entity_id: 5506041 });

    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'DELETE',
      '/v3/websites/pages/41938922/entities/5506041/wedding-accounts/4664323'
    );
  });
});
```

Update the import at top of the test file:

```ts
import {
  listFaqs,
  addFaq,
  updateFaq,
  removeFaq,
  listHomeSections,
  addHomeSection,
  updateHomeSection,
  removeHomeSection,
  listPois,
  addPoi,
  updatePoi,
  removePoi,
  _resetPageIdCache,
} from '../src/tools/website-content.js';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/website-content.test.ts`
Expected: FAIL — POI functions not exported.

- [ ] **Step 3: Implement POI CRUD**

Append to `src/tools/website-content.ts` before `registerWebsiteContentTools`:

```ts
// ===== Points of Interest =====

interface PoiFields {
  title?: string;
  description?: string;
  display_order?: number;
  address1?: string;
  address2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: string;
  longitude?: string;
  google_place_id?: string;
  contact_phone?: string;
  url?: string;
}

function buildPoiBody(args: PoiFields, weddingAccountId: number, poiEntityId: number): Record<string, unknown> {
  const body: Record<string, unknown> = {
    wedding_account_id: weddingAccountId,
    poi_entity_id: poiEntityId,
  };
  if (args.title !== undefined) body.title = args.title;
  if (args.description !== undefined) body.description = args.description;
  if (args.display_order !== undefined) body.display_order = args.display_order;
  if (args.address1 !== undefined) body.address1 = args.address1;
  if (args.address2 !== undefined) body.address2 = args.address2;
  if (args.city !== undefined) body.city = args.city;
  if (args.state_province !== undefined) body.state_province = args.state_province;
  if (args.postal_code !== undefined) body.postal_code = args.postal_code;
  if (args.country_code !== undefined) body.country_code = args.country_code;
  if (args.latitude !== undefined) body.latitude = args.latitude;
  if (args.longitude !== undefined) body.longitude = args.longitude;
  if (args.google_place_id !== undefined) body.google_place_id = args.google_place_id;
  if (args.contact_phone !== undefined) body.contact_phone = args.contact_phone;
  if (args.url !== undefined) body.url = args.url;
  return body;
}

export async function listPois(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/points-of-interest/wedding-accounts/${weddingAccountId}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addPoi(args: PoiFields & { title: string }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildPoiBody(args, weddingAccountId, 0);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/points-of-interest',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updatePoi(args: PoiFields & { poi_entity_id: number }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildPoiBody(args, weddingAccountId, args.poi_entity_id);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/points-of-interest/${args.poi_entity_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removePoi(args: { poi_entity_id: number }): Promise<ToolResult> {
  await deletePageEntity('POI', args.poi_entity_id);
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.poi_entity_id }) }] };
}
```

Register in `registerWebsiteContentTools` (before the closing brace):

```ts
  server.tool(
    'list_pois',
    'List points-of-interest on the "Things to Do" page',
    {},
    listPois
  );

  server.tool(
    'add_poi',
    'Add a point-of-interest to the Things-to-Do page (restaurant, attraction, etc.)',
    {
      title: z.string().describe('Name of the place'),
      description: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
      latitude: z.string().optional().describe('Decimal degrees as string'),
      longitude: z.string().optional().describe('Decimal degrees as string'),
      google_place_id: z.string().optional(),
      contact_phone: z.string().optional(),
      url: z.string().optional(),
      display_order: z.number().optional(),
    },
    addPoi
  );

  server.tool(
    'update_poi',
    'Update a point-of-interest. Provide only the fields you want to change.',
    {
      poi_entity_id: z.number().describe('POI ID from list_pois'),
      title: z.string().optional(),
      description: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      google_place_id: z.string().optional(),
      contact_phone: z.string().optional(),
      url: z.string().optional(),
      display_order: z.number().optional(),
    },
    updatePoi
  );

  server.tool(
    'remove_poi',
    'Remove a point-of-interest from the Things-to-Do page',
    { poi_entity_id: z.number() },
    removePoi
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/website-content.test.ts`
Expected: PASS for all content tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/website-content.ts tests/website-content.test.ts
git commit -m "feat(website): add POI CRUD tools for Things-to-Do page"
```

---

## Task 10: Register content tools and run full suite

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add import and registration**

Edit `src/index.ts`. Add the import:

```ts
import { registerWebsiteContentTools } from './tools/website-content.js';
```

Add the registration call:

```ts
registerWebsiteContentTools(server);
```

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: build succeeds with no TS errors.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all tests pass (including the existing suite).

- [ ] **Step 4: Grep the built bundle to confirm all 18 tool names are registered**

Run: `for t in list_pages set_page_hidden reorder_pages update_page get_wedding_settings update_wedding_settings list_faqs add_faq update_faq remove_faq list_home_sections add_home_section update_home_section remove_home_section list_pois add_poi update_poi remove_poi; do grep -q "\"$t\"" dist/bundle.js && echo "OK $t" || echo "MISSING $t"; done`
Expected: 18 `OK` lines, no `MISSING`.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: register website content tools in MCP server"
```

---

## Task 11: Update README/version (optional housekeeping)

**Files:**
- Modify: `package.json` (bump version)

- [ ] **Step 1: Bump version**

Edit `package.json` — bump `version` to `0.3.0` (minor for new tool surface).

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.3.0 for website editing tools"
```

---

## Coverage check (self-review)

| Spec requirement | Task |
|---|---|
| `weddingId` exposure in client | Task 1 |
| `get_wedding_settings`, `update_wedding_settings` | Task 5 |
| `list_pages`, `update_page`, `set_page_hidden`, `reorder_pages` | Tasks 2, 3, 4 |
| Home section CRUD (4 tools) | Task 8 |
| FAQ CRUD (4 tools) | Task 7 |
| POI CRUD (4 tools) | Task 9 |
| Shared `deletePageEntity` helper + page-id cache | Task 7 |
| MCP registration | Tasks 6, 10 |
| Tests for fetch-merge in `update_wedding_settings` | Task 5 |
| Tests for page-id cache reuse | Task 7 |
| Tests for happy path on every tool | Tasks 2–9 |

Deferred (per spec): theme/customization writes, image uploads, travel content writes, wedding-party CRUD, RSVP page edits. Not in this plan.
