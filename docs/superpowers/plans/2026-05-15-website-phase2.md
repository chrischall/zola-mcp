# Website Editing Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 11 more MCP tools covering the now-fully-captured Zola surface — travel CRUD, theme/design controls, and registry-item CRUD with product search.

**Architecture:** Travel CRUD extends `src/tools/website-content.ts` (it shares the same entity-on-a-page DELETE pattern; we add `'TRAVEL'` to the `PageType` union and `travel_page` to the cache). Theme/design and registry-items each get their own file: `src/tools/website-theme.ts` and `src/tools/registry-items.ts`. All go through existing `client.requestMobile()`.

**Tech Stack:** TypeScript, MCP TS SDK, `zod`, `vitest`. Same patterns as Phase 1.

**Reference:** Endpoints + bodies documented in `docs/superpowers/specs/2026-05-15-missing-features.md` (this is the spec).

---

## Task 1: Add Travel to PageType union and cache

Travel deletes use the same shared endpoint shape (`/v3/websites/pages/{page_id}/entities/{entity_id}/wedding-accounts/{acct}`) as FAQs/home-sections/POIs. Extend the `PageType` union and `PagesFullResponse` to include `'TRAVEL'` / `travel_page`.

**Files:**
- Modify: `src/tools/website-content.ts`
- Modify: `tests/website-content.test.ts`

- [ ] **Step 1:** In `tests/website-content.test.ts`, update `MOCK_PAGES_RESPONSE` (at the top of the file) to include `travel_page: { page_id: 41938918, type: 'TRAVEL' }`. Also update the existing cross-type cache test to include a 4th remove tool (travel) once Task 2 lands — for now leave that test as-is; you'll extend it in Task 2 Step 1.

- [ ] **Step 2:** In `src/tools/website-content.ts`:
  - Change `type PageType = 'HOME' | 'FAQ' | 'POI';` to `type PageType = 'HOME' | 'FAQ' | 'POI' | 'TRAVEL';`
  - Change `PagesFullResponse` to include `travel_page?: { page_id: number };`
  - In `getPageId`, add `if (response.data.travel_page) perAccount.set('TRAVEL', response.data.travel_page.page_id);`

- [ ] **Step 3:** Run `npm test` — expect all 71 existing tests still pass (the change is additive).

- [ ] **Step 4:** Commit:
  ```bash
  git add src/tools/website-content.ts tests/website-content.test.ts
  git commit -m "feat(website): extend PageType union to include TRAVEL"
  ```

---

## Task 2: Travel CRUD tools

4 tools matching the POI pattern. Travel items have these fields: `travel_entity_id`, `type` ("HOTEL"|"FLIGHT"|"TRAIN"), `name`, `note`, `code`, `address1`/`address2`, `city`, `state_province`, `postal_code`, `country_code`, `latitude`, `longitude`, `google_place_id`, `contact_number`, `email_address`, `url`, `source`, `timezone`, `display_order`.

**Files:**
- Modify: `src/tools/website-content.ts`
- Modify: `tests/website-content.test.ts`

- [ ] **Step 1: Write failing tests**

Append a new describe block to `tests/website-content.test.ts`:

```ts
describe('website-content: travel items', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
    _resetPageIdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listTravelItems: GETs travel for wedding account', async () => {
    reqSpy.mockResolvedValueOnce({
      data: [{ travel_entity_id: 4752577, type: 'HOTEL', name: 'DoubleTree' }],
    } as never);
    const result = await listTravelItems();
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/travel/wedding-accounts/4664323');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].name).toBe('DoubleTree');
  });

  it('addTravelItem: POSTs with travel_entity_id=0', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { travel_entity_id: 4752577, name: 'DoubleTree' },
    } as never);
    await addTravelItem({
      type: 'HOTEL',
      name: 'DoubleTree Suites',
      address1: '6300 Carnegie Blvd',
      city: 'Charlotte',
      state_province: 'NC',
      postal_code: '28211',
      country_code: 'US',
      contact_number: '(704) 364-2400',
      url: 'https://hilton.com/x',
      timezone: 'America/New_York',
      source: 'GOOGLE_PLACES',
    });
    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/websites/travel',
      expect.objectContaining({
        wedding_account_id: 4664323,
        travel_entity_id: 0,
        type: 'HOTEL',
        name: 'DoubleTree Suites',
        timezone: 'America/New_York',
      })
    );
  });

  it('addTravelItem: omits unset optional fields', async () => {
    reqSpy.mockResolvedValueOnce({ data: { travel_entity_id: 1 } } as never);
    await addTravelItem({ type: 'HOTEL', name: 'Bare Hotel' });
    const body = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(body.travel_entity_id).toBe(0);
    expect(body.type).toBe('HOTEL');
    expect(body.name).toBe('Bare Hotel');
    expect(body).not.toHaveProperty('contact_number');
    expect(body).not.toHaveProperty('latitude');
  });

  it('updateTravelItem: PUTs to /travel/{id}', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { travel_entity_id: 4752577, name: 'Renamed' },
    } as never);
    await updateTravelItem({ travel_entity_id: 4752577, name: 'Renamed' });
    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/websites/travel/4752577',
      expect.objectContaining({
        wedding_account_id: 4664323,
        travel_entity_id: 4752577,
        name: 'Renamed',
      })
    );
  });

  it('removeTravelItem: looks up TRAVEL page_id then DELETEs', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: null } as never);
    await removeTravelItem({ travel_entity_id: 4752577 });
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'DELETE',
      '/v3/websites/pages/41938918/entities/4752577/wedding-accounts/4664323'
    );
  });
});
```

Also extend the existing cross-type cache test (originally tests FAQ+HOME+POI) to additionally call `removeTravelItem` and assert still only one GET. Find the test titled "page-id cache populates all 3 page types from one fetch" (or whatever the cross-type test is named after Task 1's coverage additions) and add a 4th `removeTravelItem` call + an additional `{data: null}` mock. Assert total `getCalls` is still 1.

Update import:

```ts
import {
  ...existing,
  listTravelItems,
  addTravelItem,
  updateTravelItem,
  removeTravelItem,
} from '../src/tools/website-content.js';
```

- [ ] **Step 2:** Run `npm test -- tests/website-content.test.ts` — expect FAIL on missing exports.

- [ ] **Step 3: Implement** — append to `src/tools/website-content.ts` before `registerWebsiteContentTools`:

```ts
// ===== Travel items (hotels, flights, transportation) =====

type TravelType = 'HOTEL' | 'FLIGHT' | 'TRAIN' | 'BUS' | 'CAR' | 'OTHER';

interface TravelFields {
  type?: TravelType;
  name?: string;
  note?: string;
  code?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: string;
  longitude?: string;
  google_place_id?: string;
  contact_number?: string;
  email_address?: string;
  url?: string;
  source?: string;
  timezone?: string;
  display_order?: number;
}

function buildTravelBody(args: TravelFields, weddingAccountId: number, travelEntityId: number): Record<string, unknown> {
  const body: Record<string, unknown> = {
    wedding_account_id: weddingAccountId,
    travel_entity_id: travelEntityId,
  };
  if (args.type !== undefined) body.type = args.type;
  if (args.name !== undefined) body.name = args.name;
  if (args.note !== undefined) body.note = args.note;
  if (args.code !== undefined) body.code = args.code;
  if (args.address1 !== undefined) body.address1 = args.address1;
  if (args.address2 !== undefined) body.address2 = args.address2;
  if (args.city !== undefined) body.city = args.city;
  if (args.state_province !== undefined) body.state_province = args.state_province;
  if (args.postal_code !== undefined) body.postal_code = args.postal_code;
  if (args.country_code !== undefined) body.country_code = args.country_code;
  if (args.latitude !== undefined) body.latitude = args.latitude;
  if (args.longitude !== undefined) body.longitude = args.longitude;
  if (args.google_place_id !== undefined) body.google_place_id = args.google_place_id;
  if (args.contact_number !== undefined) body.contact_number = args.contact_number;
  if (args.email_address !== undefined) body.email_address = args.email_address;
  if (args.url !== undefined) body.url = args.url;
  if (args.source !== undefined) body.source = args.source;
  if (args.timezone !== undefined) body.timezone = args.timezone;
  if (args.display_order !== undefined) body.display_order = args.display_order;
  return body;
}

export async function listTravelItems(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/travel/wedding-accounts/${weddingAccountId}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addTravelItem(args: TravelFields & { type: TravelType; name: string }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildTravelBody(args, weddingAccountId, 0);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/travel',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateTravelItem(args: TravelFields & { travel_entity_id: number }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildTravelBody(args, weddingAccountId, args.travel_entity_id);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/travel/${args.travel_entity_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeTravelItem(args: { travel_entity_id: number }): Promise<ToolResult> {
  await deletePageEntity('TRAVEL', args.travel_entity_id);
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.travel_entity_id }) }] };
}
```

Register inside `registerWebsiteContentTools`:

```ts
  server.tool('list_travel_items', 'List hotels, flights, and transportation on the website Travel page', {}, listTravelItems);

  server.tool(
    'add_travel_item',
    'Add a travel item (hotel, flight, train, car, bus) to the Travel page',
    {
      type: z.enum(['HOTEL', 'FLIGHT', 'TRAIN', 'BUS', 'CAR', 'OTHER']).describe('Travel item type'),
      name: z.string().describe('Name of the hotel/airline/etc.'),
      note: z.string().optional().describe('Free-text notes (e.g., booking code instructions)'),
      code: z.string().optional().describe('Booking code or group rate code'),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
      latitude: z.string().optional().describe('Decimal degrees as string'),
      longitude: z.string().optional().describe('Decimal degrees as string'),
      google_place_id: z.string().optional(),
      contact_number: z.string().optional(),
      email_address: z.string().optional(),
      url: z.string().optional().describe('Booking link'),
      source: z.string().optional().describe('GOOGLE_PLACES or MANUAL'),
      timezone: z.string().optional().describe('e.g. America/New_York'),
      display_order: z.number().optional(),
    },
    addTravelItem
  );

  server.tool(
    'update_travel_item',
    'Update a travel item. Provide only the fields you want to change.',
    {
      travel_entity_id: z.number().describe('Travel entity ID from list_travel_items'),
      type: z.enum(['HOTEL', 'FLIGHT', 'TRAIN', 'BUS', 'CAR', 'OTHER']).optional(),
      name: z.string().optional(),
      note: z.string().optional(),
      code: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      google_place_id: z.string().optional(),
      contact_number: z.string().optional(),
      email_address: z.string().optional(),
      url: z.string().optional(),
      source: z.string().optional(),
      timezone: z.string().optional(),
      display_order: z.number().optional(),
    },
    updateTravelItem
  );

  server.tool(
    'remove_travel_item',
    'Remove a travel item from the Travel page',
    { travel_entity_id: z.number() },
    removeTravelItem
  );
```

- [ ] **Step 4:** Run `npm test -- tests/website-content.test.ts` — expect PASS.

- [ ] **Step 5:** Commit:
  ```bash
  git add src/tools/website-content.ts tests/website-content.test.ts
  git commit -m "feat(website): add travel item CRUD tools"
  ```

---

## Task 3: Theme & design tools

New file `src/tools/website-theme.ts`. Four tools: `get_current_theme`, `search_themes`, `update_current_theme`, `update_website_customization`.

**Files:**
- Create: `src/tools/website-theme.ts`
- Create: `tests/website-theme.test.ts`

- [ ] **Step 1: Write failing tests** — create `tests/website-theme.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  getCurrentTheme,
  searchThemes,
  updateCurrentTheme,
  updateWebsiteCustomization,
} from '../src/tools/website-theme.js';

const MOCK_CTX = {
  weddingAccountId: 4664323,
  weddingId: 7585869,
  registryId: 'registry-1',
  userId: 'user-1',
  weddingDate: '2026-10-17',
  weddingSlug: 'chrismer26',
};

describe('website-theme tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getCurrentTheme: GETs /v3/themes/current', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { key: 'galata', name: 'Galata', swatch_color: 'FFFFFF' },
    } as never);
    const result = await getCurrentTheme();
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/themes/current');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.key).toBe('galata');
  });

  it('searchThemes: POSTs search criteria with defaults', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { offset: 0, limit: 50, total: 50, displayable_total: 1532, themes: [] },
    } as never);
    await searchThemes({});
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/themes/search', {
      limit: 50,
      offset: 0,
      theme_layout_types: ['MULTI_PAGE'],
    });
  });

  it('searchThemes: honors provided overrides', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await searchThemes({ limit: 20, offset: 40, theme_layout_types: ['SINGLE_PAGE'] });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/themes/search', {
      limit: 20,
      offset: 40,
      theme_layout_types: ['SINGLE_PAGE'],
    });
  });

  it('updateCurrentTheme: PUTs theme_key + theme_layout_type', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { key: 'galata', name: 'Galata' },
    } as never);
    const result = await updateCurrentTheme({ theme_key: 'galata', theme_layout_type: 'MULTI_PAGE' });
    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/themes/current', {
      theme_key: 'galata',
      theme_layout_type: 'MULTI_PAGE',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.key).toBe('galata');
  });

  it('updateCurrentTheme: defaults layout_type to MULTI_PAGE when omitted', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateCurrentTheme({ theme_key: 'blake-cranberry' });
    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/themes/current', {
      theme_key: 'blake-cranberry',
      theme_layout_type: 'MULTI_PAGE',
    });
  });

  it('updateWebsiteCustomization: POSTs only the fields provided', async () => {
    reqSpy.mockResolvedValueOnce({ data: { customization_view: {} } } as never);
    await updateWebsiteCustomization({
      accent_color: 'B20033',
      background_color: 'B51A00',
    });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      accent_color: 'B20033',
      background_color: 'B51A00',
    });
  });

  it('updateWebsiteCustomization: nests font/navigation when provided', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateWebsiteCustomization({
      body_font_color: '000000',
      navigation_background_color: 'B51A00',
    });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      body_font: { color: '000000' },
      navigation_customization: { background_color: 'B51A00' },
    });
  });
});
```

- [ ] **Step 2:** Run `npm test -- tests/website-theme.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** — create `src/tools/website-theme.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

type ThemeLayoutType = 'MULTI_PAGE' | 'SINGLE_PAGE';

export async function getCurrentTheme(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>('GET', '/v3/themes/current');
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function searchThemes(args: {
  limit?: number;
  offset?: number;
  theme_layout_types?: ThemeLayoutType[];
}): Promise<ToolResult> {
  const body = {
    limit: args.limit ?? 50,
    offset: args.offset ?? 0,
    theme_layout_types: args.theme_layout_types ?? ['MULTI_PAGE'],
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/themes/search',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateCurrentTheme(args: {
  theme_key: string;
  theme_layout_type?: ThemeLayoutType;
}): Promise<ToolResult> {
  const body = {
    theme_key: args.theme_key,
    theme_layout_type: args.theme_layout_type ?? 'MULTI_PAGE',
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    '/v3/themes/current',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateWebsiteCustomization(args: {
  accent_color?: string;
  background_color?: string;
  body_font_color?: string;
  navigation_background_color?: string;
  header_font_family_id?: number;
  body_font_family_id?: number;
}): Promise<ToolResult> {
  const body: Record<string, unknown> = {};
  if (args.accent_color !== undefined) body.accent_color = args.accent_color;
  if (args.background_color !== undefined) body.background_color = args.background_color;
  if (args.body_font_color !== undefined) body.body_font = { color: args.body_font_color };
  if (args.navigation_background_color !== undefined) {
    body.navigation_customization = { background_color: args.navigation_background_color };
  }
  if (args.header_font_family_id !== undefined) {
    body.header_font = { font_family_id: args.header_font_family_id };
  }
  if (args.body_font_family_id !== undefined) {
    const existing = (body.body_font as Record<string, unknown> | undefined) ?? {};
    body.body_font = { ...existing, font_family_id: args.body_font_family_id };
  }
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/website-customizations/context',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export function registerWebsiteThemeTools(server: McpServer): void {
  server.tool(
    'get_current_theme',
    'Get the currently-selected website theme: key, name, swatch color, layout type',
    {},
    getCurrentTheme
  );

  server.tool(
    'search_themes',
    'Browse the catalog of available wedding-website themes',
    {
      limit: z.number().optional().describe('Default 50'),
      offset: z.number().optional().describe('Default 0'),
      theme_layout_types: z.array(z.enum(['MULTI_PAGE', 'SINGLE_PAGE'])).optional().describe('Default ["MULTI_PAGE"]'),
    },
    searchThemes
  );

  server.tool(
    'update_current_theme',
    'Switch the wedding website to a different theme template',
    {
      theme_key: z.string().describe('Theme key from search_themes (e.g., "galata", "blake-cranberry")'),
      theme_layout_type: z.enum(['MULTI_PAGE', 'SINGLE_PAGE']).optional().describe('Default MULTI_PAGE'),
    },
    updateCurrentTheme
  );

  server.tool(
    'update_website_customization',
    'Update website colors and fonts. Provide only what changes — accepts a partial update. Colors are 6-char hex without #.',
    {
      accent_color: z.string().optional().describe('6-char hex (no #)'),
      background_color: z.string().optional(),
      body_font_color: z.string().optional(),
      navigation_background_color: z.string().optional(),
      header_font_family_id: z.number().optional().describe('Font family ID from get_website_customizations options'),
      body_font_family_id: z.number().optional(),
    },
    updateWebsiteCustomization
  );
}
```

- [ ] **Step 4:** Run `npm test -- tests/website-theme.test.ts` — expect PASS for all 7 tests.

- [ ] **Step 5:** Commit:
  ```bash
  git add src/tools/website-theme.ts tests/website-theme.test.ts
  git commit -m "feat(website): add theme and design customization tools"
  ```

---

## Task 4: Registry-item CRUD + product search

New file `src/tools/registry-items.ts`. Four tools: `search_registry_products` (browse products by category), `add_registry_item` (add SKU to a collection), `update_registry_item`, `remove_registry_item`.

Important: the registry uses `collection_id` internally. The captured value was `"6951805387a7d72e5a941457"`. The default collection ID is not currently in `UserContext`. For Phase 2 we make `collection_id` an optional arg with a discovery path: if omitted, the tool fetches the registry once via `GET /v4/shop/registry?registry_id={id}&updated_modules=true` and pulls the first/default collection ID. Cache it for the process lifetime.

**Files:**
- Create: `src/tools/registry-items.ts`
- Create: `tests/registry-items.test.ts`

- [ ] **Step 1: Write failing tests** — create `tests/registry-items.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  searchRegistryProducts,
  addRegistryItem,
  updateRegistryItem,
  removeRegistryItem,
  _resetRegistryCollectionCache,
} from '../src/tools/registry-items.js';

const MOCK_CTX = {
  weddingAccountId: 4664323,
  weddingId: 7585869,
  registryId: 'registry-1',
  userId: 'user-1',
  weddingDate: '2026-10-17',
  weddingSlug: 'chrismer26',
};

const MOCK_REGISTRY_RESPONSE = {
  data: {
    groups: [
      {
        modules: [
          {
            type: 'COLLECTION',
            id: 'col-1',
          },
        ],
      },
    ],
    default_collection_id: 'col-1',
  },
};

describe('registry-items tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue(MOCK_CTX);
    _resetRegistryCollectionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchRegistryProducts: POSTs offset+limit+registry_id', async () => {
    reqSpy.mockResolvedValueOnce({ data: { entities: [] } } as never);
    await searchRegistryProducts({ category_id: 544 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/categories/544/entities', {
      offset: 0,
      limit: 50,
      registry_id: 'registry-1',
    });
  });

  it('searchRegistryProducts: honors pagination args', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await searchRegistryProducts({ category_id: 544, offset: 100, limit: 25 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/categories/544/entities', {
      offset: 100,
      limit: 25,
      registry_id: 'registry-1',
    });
  });

  it('addRegistryItem: when collection_id provided, POSTs directly', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { collection_item_id: 'item-99', sku_id: 'sku-1' },
    } as never);
    await addRegistryItem({
      sku_id: 'sku-1',
      collection_id: 'col-1',
      quantity: 2,
      most_wanted: true,
      enable_group_gifting: false,
    });
    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/registries/registry-1/collections/col-1',
      { sku_id: 'sku-1', quantity: 2, most_wanted: true, enable_group_gifting: false }
    );
  });

  it('addRegistryItem: when collection_id omitted, looks it up from /v4/shop/registry first', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_REGISTRY_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'item-1' } } as never);

    await addRegistryItem({ sku_id: 'sku-1' });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'GET', '/v4/shop/registry?registry_id=registry-1&updated_modules=true');
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/v3/registries/registry-1/collections/col-1',
      { sku_id: 'sku-1', quantity: 1, most_wanted: false, enable_group_gifting: false }
    );
  });

  it('addRegistryItem: caches collection_id across calls', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_REGISTRY_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'a' } } as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'b' } } as never);

    await addRegistryItem({ sku_id: 'sku-1' });
    await addRegistryItem({ sku_id: 'sku-2' });

    const getCalls = reqSpy.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls).toHaveLength(1);
  });

  it('updateRegistryItem: PUTs to /items/{id}', async () => {
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'item-1' } } as never);
    await updateRegistryItem({
      collection_item_id: 'item-1',
      collection_id: 'col-1',
      quantity: 3,
      personal_note: 'For the kitchen',
      most_wanted: true,
      group_gift: false,
      marked_fulfilled: false,
    });
    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/registries/registry-1/items/item-1',
      {
        quantity: 3,
        group_gift: false,
        marked_fulfilled: false,
        personal_note: 'For the kitchen',
        most_wanted: true,
        collection_id: 'col-1',
      }
    );
  });

  it('removeRegistryItem: DELETEs /items/{id}', async () => {
    reqSpy.mockResolvedValueOnce({ data: null } as never);
    await removeRegistryItem({ collection_item_id: 'item-1' });
    expect(reqSpy).toHaveBeenCalledWith('DELETE', '/v3/registries/registry-1/items/item-1');
  });
});
```

- [ ] **Step 2:** Run `npm test -- tests/registry-items.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** — create `src/tools/registry-items.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

const collectionIdCache = new Map<string, string>(); // registryId -> default collection_id

/** Test-only: clear the cache between tests. */
export function _resetRegistryCollectionCache(): void {
  collectionIdCache.clear();
}

interface RegistryShape {
  data: {
    groups?: Array<{
      modules?: Array<{ type?: string; id?: string }>;
    }>;
    default_collection_id?: string;
  };
}

async function getDefaultCollectionId(registryId: string): Promise<string> {
  const cached = collectionIdCache.get(registryId);
  if (cached !== undefined) return cached;
  const response = await client.requestMobile<RegistryShape>(
    'GET',
    `/v4/shop/registry?registry_id=${registryId}&updated_modules=true`
  );
  // Prefer top-level default_collection_id if present; otherwise scan modules.
  let collectionId = response.data.default_collection_id;
  if (!collectionId) {
    for (const group of response.data.groups ?? []) {
      for (const mod of group.modules ?? []) {
        if (mod.type === 'COLLECTION' && mod.id) {
          collectionId = mod.id;
          break;
        }
      }
      if (collectionId) break;
    }
  }
  if (!collectionId) {
    throw new Error('Could not determine default collection ID for registry');
  }
  collectionIdCache.set(registryId, collectionId);
  return collectionId;
}

export async function searchRegistryProducts(args: {
  category_id: number;
  offset?: number;
  limit?: number;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const body = {
    offset: args.offset ?? 0,
    limit: args.limit ?? 50,
    registry_id: registryId,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    `/v3/categories/${args.category_id}/entities`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addRegistryItem(args: {
  sku_id: string;
  collection_id?: string;
  quantity?: number;
  most_wanted?: boolean;
  enable_group_gifting?: boolean;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const collectionId = args.collection_id ?? (await getDefaultCollectionId(registryId));
  const body = {
    sku_id: args.sku_id,
    quantity: args.quantity ?? 1,
    most_wanted: args.most_wanted ?? false,
    enable_group_gifting: args.enable_group_gifting ?? false,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    `/v3/registries/${registryId}/collections/${collectionId}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateRegistryItem(args: {
  collection_item_id: string;
  collection_id: string;
  quantity: number;
  group_gift: boolean;
  marked_fulfilled: boolean;
  personal_note: string;
  most_wanted: boolean;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const body = {
    quantity: args.quantity,
    group_gift: args.group_gift,
    marked_fulfilled: args.marked_fulfilled,
    personal_note: args.personal_note,
    most_wanted: args.most_wanted,
    collection_id: args.collection_id,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/registries/${registryId}/items/${args.collection_item_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeRegistryItem(args: { collection_item_id: string }): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  await client.requestMobile<MobileEnvelope<unknown>>(
    'DELETE',
    `/v3/registries/${registryId}/items/${args.collection_item_id}`
  );
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.collection_item_id }) }] };
}

export function registerRegistryItemTools(server: McpServer): void {
  server.tool(
    'search_registry_products',
    'Browse Zola products in a category, scoped to your registry (results include fulfillment status). Use list-categories or get_registry to discover category IDs.',
    {
      category_id: z.number().describe('Zola product category ID'),
      offset: z.number().optional().describe('Default 0'),
      limit: z.number().optional().describe('Default 50'),
    },
    searchRegistryProducts
  );

  server.tool(
    'add_registry_item',
    'Add a product (by SKU) to the registry. If collection_id is omitted, the default collection is looked up automatically.',
    {
      sku_id: z.string().describe('Product SKU ID (e.g., from search_registry_products)'),
      collection_id: z.string().optional().describe('Collection to add into; defaults to the registry\'s default collection'),
      quantity: z.number().optional().describe('Default 1'),
      most_wanted: z.boolean().optional().describe('Mark as a most-wanted gift. Default false'),
      enable_group_gifting: z.boolean().optional().describe('Allow multiple guests to chip in. Default false'),
    },
    addRegistryItem
  );

  server.tool(
    'update_registry_item',
    'Update an existing registry item — all fields must be supplied (it\'s a full replace)',
    {
      collection_item_id: z.string().describe('Item ID from get_registry'),
      collection_id: z.string().describe('Collection the item belongs to'),
      quantity: z.number(),
      group_gift: z.boolean(),
      marked_fulfilled: z.boolean(),
      personal_note: z.string(),
      most_wanted: z.boolean(),
    },
    updateRegistryItem
  );

  server.tool(
    'remove_registry_item',
    'Remove an item from the registry',
    { collection_item_id: z.string() },
    removeRegistryItem
  );
}
```

- [ ] **Step 4:** Run `npm test -- tests/registry-items.test.ts` — expect PASS for all 7 tests.

- [ ] **Step 5:** Commit:
  ```bash
  git add src/tools/registry-items.ts tests/registry-items.test.ts
  git commit -m "feat(registry): add registry item CRUD and product search tools"
  ```

---

## Task 5: Register Phase 2 tools in `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1:** Add three imports:
  ```ts
  import { registerWebsiteThemeTools } from './tools/website-theme.js';
  import { registerRegistryItemTools } from './tools/registry-items.js';
  ```
  (Travel tools are part of `registerWebsiteContentTools` which is already registered.)

- [ ] **Step 2:** Add two registration calls:
  ```ts
  registerWebsiteThemeTools(server);
  registerRegistryItemTools(server);
  ```

- [ ] **Step 3:** `npm run build` — expect success.

- [ ] **Step 4:** `npm test` — expect all tests pass.

- [ ] **Step 5:** Verify all 11 new tool names land in the bundle:
  ```bash
  for t in list_travel_items add_travel_item update_travel_item remove_travel_item get_current_theme search_themes update_current_theme update_website_customization search_registry_products add_registry_item update_registry_item remove_registry_item; do grep -q "\"$t\"" dist/bundle.js && echo "OK $t" || echo "MISSING $t"; done
  ```
  Expect 12 `OK` lines (11 unique + remove_travel_item; recount: travel=4, theme=4, registry=4 = 12).

- [ ] **Step 6:** Commit:
  ```bash
  git add src/index.ts
  git commit -m "feat: register phase 2 website tools in MCP server"
  ```

---

## Task 6: Version bump

- [ ] **Step 1:** Edit `package.json` — change `"version": "0.3.0"` to `"version": "0.4.0"`.

- [ ] **Step 2:** Commit:
  ```bash
  git add package.json
  git commit -m "chore: bump version to 0.4.0 for phase 2 website tools"
  ```

---

## Coverage check

| Spec / capture item | Task |
|---|---|
| Travel CRUD (4 tools, shared DELETE pattern) | Tasks 1, 2 |
| Theme read + search + switch + customization (4 tools) | Task 3 |
| Registry item CRUD + product search (4 tools) | Task 4 |
| Collection-id auto-discovery + cache | Task 4 |
| MCP registration | Task 5 |
| Version bump | Task 6 |

12 new tools total (Phase 1 had 18 → after Phase 2 we'll have 30 website/registry tools). Deferred (still): wedding party CRUD, photo gallery, inquiry reply, bulk guest update.
