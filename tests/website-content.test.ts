import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
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
  listTravelItems,
  addTravelItem,
  updateTravelItem,
  removeTravelItem,
  _resetPageIdCache,
} from '../src/tools/website-content.js';
import { setupClientMocks } from './_fixtures.js';
import { confirmed } from './_confirm-helpers.js';

const MOCK_PAGES_RESPONSE = {
  data: {
    home_page: { page_id: 41938915, type: 'HOME' },
    faq_page: { page_id: 41938921, type: 'FAQ' },
    poi_page: { page_id: 41938922, type: 'POI' },
    travel_page: { page_id: 41938918, type: 'TRAVEL' },
  },
};

const PAGES_PATH = '/v3/websites/pages/wedding-accounts/full';

/**
 * Routing mock for the remove_* tools. Each confirm phase reads the entity's
 * list (to name what is being deleted) and the page map; phase 2 then DELETEs.
 * Routes by method + path so the tests do not depend on call order.
 */
function wireRemovals(
  reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>,
  pages: unknown = MOCK_PAGES_RESPONSE
) {
  reqSpy.mockImplementation((async (method: string, path: string) => {
    if (method === 'GET' && path === PAGES_PATH) return pages;
    if (method === 'GET' && path.startsWith('/v3/websites/faqs/')) {
      return { data: [6522901, 6522902, 999].map((id) => ({ faq_entity_id: id, question: `Question ${id}?`, answer: 'A' })) };
    }
    if (method === 'GET' && path.startsWith('/v3/websites/home-sections/')) {
      return { data: [{ homepage_entity_id: 1381564, title: 'Our Story' }] };
    }
    if (method === 'GET' && path.startsWith('/v3/websites/points-of-interest/')) {
      return { data: [{ poi_entity_id: 5506041, title: 'Example Museum' }] };
    }
    if (method === 'GET' && path.startsWith('/v3/websites/travel/')) {
      return { data: [4, 4752577].map((id) => ({ travel_entity_id: id, name: `Example Hotel ${id}`, type: 'HOTEL' })) };
    }
    if (method === 'DELETE') return { data: null };
    throw new Error(`unexpected request ${method} ${path}`);
  }) as never);
}

const pageLookups = (reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>) =>
  reqSpy.mock.calls.filter((c) => c[0] === 'GET' && c[1] === PAGES_PATH);
const deletes = (reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>) =>
  reqSpy.mock.calls.filter((c) => c[0] === 'DELETE');

describe('website-content: faqs', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
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

    const result = await listFaqs(client);

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/faqs/wedding-accounts/1000001');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question).toBe('Q1');
  });

  it('addFaq: POSTs new FAQ with faq_entity_id=0', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { faq_entity_id: 9999, question: 'New?', answer: 'Yes', display_order: 0 },
    } as never);

    const result = await addFaq(client, { question: 'New?', answer: 'Yes', display_order: 0 });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/faqs', {
      wedding_account_id: 1000001,
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

    const result = await updateFaq(client, {
      faq_entity_id: 6522901,
      question: 'Updated?',
      answer: 'Updated.',
      display_order: 3,
    });

    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/websites/faqs/6522901', {
      wedding_account_id: 1000001,
      faq_entity_id: 6522901,
      question: 'Updated?',
      answer: 'Updated.',
      display_order: 3,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.question).toBe('Updated?');
  });

  it('removeFaq: looks up FAQ page_id then DELETEs entity', async () => {
    wireRemovals(reqSpy);

    await confirmed((ctx, confirmToken) => removeFaq(client, { faq_entity_id: 6522901, confirmToken }, ctx));

    expect(reqSpy).toHaveBeenCalledWith('GET', PAGES_PATH);
    expect(deletes(reqSpy)).toEqual([
      ['DELETE', '/v3/websites/pages/41938921/entities/6522901/wedding-accounts/1000001'],
    ]);
  });

  it('removeFaq: caches page_id lookup across calls', async () => {
    wireRemovals(reqSpy);

    await confirmed((ctx, confirmToken) => removeFaq(client, { faq_entity_id: 6522901, confirmToken }, ctx));
    await confirmed((ctx, confirmToken) => removeFaq(client, { faq_entity_id: 6522902, confirmToken }, ctx));

    expect(deletes(reqSpy)).toHaveLength(2);
    expect(pageLookups(reqSpy)).toHaveLength(1);
  });

  // Gap 4: getPageId error path when faq_page is absent
  it('removeFaq: rejects with "Page of type FAQ not found" when faq_page is missing', async () => {
    const pagesWithoutFaq = {
      data: {
        home_page: { page_id: 41938915, type: 'HOME' },
        poi_page: { page_id: 41938922, type: 'POI' },
        // faq_page deliberately absent
      },
    };
    wireRemovals(reqSpy, pagesWithoutFaq);

    await expect(
      confirmed((ctx, confirmToken) => removeFaq(client, { faq_entity_id: 999, confirmToken }, ctx))
    ).rejects.toThrow(/Page of type FAQ not found/);
    expect(deletes(reqSpy)).toHaveLength(0);
  });

  // Gap 6: addFaq default display_order when omitted
  it('addFaq: defaults display_order to 0 when omitted', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { faq_entity_id: 9999, question: 'Default order?', answer: 'Yes', display_order: 0 },
    } as never);

    await addFaq(client, { question: 'Default order?', answer: 'Yes' }); // no display_order

    const body = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(body.display_order).toBe(0);
  });

  // Gap 8: removeFaq return content
  it('removeFaq: returns {removed: faq_entity_id} in content', async () => {
    wireRemovals(reqSpy);

    const result = await confirmed((ctx, confirmToken) =>
      removeFaq(client, { faq_entity_id: 6522901, confirmToken }, ctx)
    );

    expect(JSON.parse(result.content[0].text).removed).toBe(6522901);
  });

  // Gap 5: cross-type cache — one GET populates HOME, FAQ, POI, and TRAVEL
  it('cache: one GET populates all four page types (FAQ + HOME + POI + TRAVEL removes = 1 GET + 4 DELETEs)', async () => {
    wireRemovals(reqSpy);

    await confirmed((ctx, confirmToken) => removeFaq(client, { faq_entity_id: 6522901, confirmToken }, ctx));
    await confirmed((ctx, confirmToken) => removeHomeSection(client, { homepage_entity_id: 1381564, confirmToken }, ctx));
    await confirmed((ctx, confirmToken) => removePoi(client, { poi_entity_id: 5506041, confirmToken }, ctx));
    await confirmed((ctx, confirmToken) => removeTravelItem(client, { travel_entity_id: 4, confirmToken }, ctx));

    expect(deletes(reqSpy)).toHaveLength(4);
    expect(pageLookups(reqSpy)).toHaveLength(1);
  });
});

describe('website-content: home sections', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
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

    const result = await listHomeSections(client);

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/home-sections/wedding-accounts/1000001');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].title).toBe('Story 1');
  });

  it('addHomeSection: POSTs new section with homepage_entity_id=0', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { homepage_entity_id: 1422067, title: 'New', subtitle: 'sub', description: 'd', display_order: 2, hidden: false },
    } as never);

    await addHomeSection(client, {
      title: 'New',
      subtitle: 'sub',
      description: 'd',
      display_order: 2,
    });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/home-sections', {
      wedding_account_id: 1000001,
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

    await updateHomeSection(client, {
      homepage_entity_id: 1381564,
      title: 'Edited',
      subtitle: 'sub',
      description: 'd',
      display_order: 0,
      hidden: false,
    });

    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/websites/home-sections/1381564', {
      wedding_account_id: 1000001,
      homepage_entity_id: 1381564,
      title: 'Edited',
      subtitle: 'sub',
      description: 'd',
      display_order: 0,
      hidden: false,
    });
  });

  it('removeHomeSection: looks up HOME page_id then DELETEs entity', async () => {
    wireRemovals(reqSpy);

    await confirmed((ctx, confirmToken) =>
      removeHomeSection(client, { homepage_entity_id: 1381564, confirmToken }, ctx)
    );

    expect(deletes(reqSpy)).toEqual([
      ['DELETE', '/v3/websites/pages/41938915/entities/1381564/wedding-accounts/1000001'],
    ]);
  });

  // Gap 7: addHomeSection defaults display_order and hidden when omitted
  it('addHomeSection: defaults display_order to 0 and hidden to false when omitted', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { homepage_entity_id: 1422067, title: 'No defaults', subtitle: 'sub', description: 'd', display_order: 0, hidden: false },
    } as never);

    await addHomeSection(client, { title: 'No defaults', subtitle: 'sub', description: 'd' });

    const body = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(body.display_order).toBe(0);
    expect(body.hidden).toBe(false);
  });

  // Gap 8: removeHomeSection return content
  it('removeHomeSection: returns {removed: homepage_entity_id} in content', async () => {
    wireRemovals(reqSpy);

    const result = await confirmed((ctx, confirmToken) =>
      removeHomeSection(client, { homepage_entity_id: 1381564, confirmToken }, ctx)
    );

    expect(JSON.parse(result.content[0].text).removed).toBe(1381564);
  });
});

describe('website-content: points of interest', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
    _resetPageIdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listPois: GETs points-of-interest for wedding account', async () => {
    reqSpy.mockResolvedValueOnce({
      data: [{ poi_entity_id: 5506041, title: 'Rhino Market' }],
    } as never);

    const result = await listPois(client);

    expect(reqSpy).toHaveBeenCalledWith(
      'GET',
      '/v3/websites/points-of-interest/wedding-accounts/1000001'
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].title).toBe('Rhino Market');
  });

  it('addPoi: POSTs with poi_entity_id=0 and all provided fields', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { poi_entity_id: 5506041, title: 'Rhino Market' },
    } as never);

    await addPoi(client, {
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
        wedding_account_id: 1000001,
        poi_entity_id: 0,
        title: 'Rhino Market',
        address1: '1414 South Tryon Street',
        google_place_id: 'ChIJ3VVpfi-fVogRMuoFolGsGQY',
      })
    );
  });

  it('addPoi: omits unset optional fields', async () => {
    reqSpy.mockResolvedValueOnce({ data: { poi_entity_id: 1 } } as never);
    await addPoi(client, { title: 'Bare POI' });
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

    await updatePoi(client, { poi_entity_id: 5506041, title: 'Renamed' });

    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/websites/points-of-interest/5506041',
      expect.objectContaining({
        wedding_account_id: 1000001,
        poi_entity_id: 5506041,
        title: 'Renamed',
      })
    );
  });

  it('removePoi: looks up POI page_id then DELETEs entity', async () => {
    wireRemovals(reqSpy);

    await confirmed((ctx, confirmToken) => removePoi(client, { poi_entity_id: 5506041, confirmToken }, ctx));

    expect(deletes(reqSpy)).toEqual([
      ['DELETE', '/v3/websites/pages/41938922/entities/5506041/wedding-accounts/1000001'],
    ]);
  });

  // Gap 8: removePoi return content
  it('removePoi: returns {removed: poi_entity_id} in content', async () => {
    wireRemovals(reqSpy);

    const result = await confirmed((ctx, confirmToken) =>
      removePoi(client, { poi_entity_id: 5506041, confirmToken }, ctx)
    );

    expect(JSON.parse(result.content[0].text).removed).toBe(5506041);
  });
});

describe('website-content: travel items', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
    _resetPageIdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listTravelItems: GETs travel for wedding account', async () => {
    reqSpy.mockResolvedValueOnce({
      data: [{ travel_entity_id: 4752577, type: 'HOTEL', name: 'DoubleTree' }],
    } as never);
    const result = await listTravelItems(client);
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/travel/wedding-accounts/1000001');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].name).toBe('DoubleTree');
  });

  it('addTravelItem: POSTs with travel_entity_id=0', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { travel_entity_id: 4752577, name: 'DoubleTree' },
    } as never);
    await addTravelItem(client, {
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
        wedding_account_id: 1000001,
        travel_entity_id: 0,
        type: 'HOTEL',
        name: 'DoubleTree Suites',
        timezone: 'America/New_York',
      })
    );
  });

  it('addTravelItem: omits unset optional fields', async () => {
    reqSpy.mockResolvedValueOnce({ data: { travel_entity_id: 1 } } as never);
    await addTravelItem(client, { type: 'HOTEL', name: 'Bare Hotel' });
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
    await updateTravelItem(client, { travel_entity_id: 4752577, name: 'Renamed' });
    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/websites/travel/4752577',
      expect.objectContaining({
        wedding_account_id: 1000001,
        travel_entity_id: 4752577,
        name: 'Renamed',
      })
    );
  });

  it('removeTravelItem: looks up TRAVEL page_id then DELETEs', async () => {
    wireRemovals(reqSpy);
    await confirmed((ctx, confirmToken) =>
      removeTravelItem(client, { travel_entity_id: 4752577, confirmToken }, ctx)
    );
    expect(deletes(reqSpy)).toEqual([
      ['DELETE', '/v3/websites/pages/41938918/entities/4752577/wedding-accounts/1000001'],
    ]);
  });
});
