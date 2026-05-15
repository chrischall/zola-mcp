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

  // Gap 4: getPageId error path when faq_page is absent
  it('removeFaq: rejects with "Page of type FAQ not found" when faq_page is missing', async () => {
    const pagesWithoutFaq = {
      data: {
        home_page: { page_id: 41938915, type: 'HOME' },
        poi_page: { page_id: 41938922, type: 'POI' },
        // faq_page deliberately absent
      },
    };
    reqSpy.mockResolvedValueOnce(pagesWithoutFaq as never);

    await expect(removeFaq({ faq_entity_id: 999 })).rejects.toThrow(/Page of type FAQ not found/);
  });

  // Gap 6: addFaq default display_order when omitted
  it('addFaq: defaults display_order to 0 when omitted', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { faq_entity_id: 9999, question: 'Default order?', answer: 'Yes', display_order: 0 },
    } as never);

    await addFaq({ question: 'Default order?', answer: 'Yes' }); // no display_order

    const body = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(body.display_order).toBe(0);
  });

  // Gap 8: removeFaq return content
  it('removeFaq: returns {removed: faq_entity_id} in content', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: null } as never);

    const result = await removeFaq({ faq_entity_id: 6522901 });

    expect(JSON.parse(result.content[0].text).removed).toBe(6522901);
  });

  // Gap 5: cross-type cache — one GET populates HOME, FAQ, and POI
  it('cache: one GET populates all three page types (FAQ + HOME + POI removes = 1 GET + 3 DELETEs)', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never); // single pages lookup
    reqSpy.mockResolvedValueOnce({ data: null } as never); // removeFaq DELETE
    reqSpy.mockResolvedValueOnce({ data: null } as never); // removeHomeSection DELETE
    reqSpy.mockResolvedValueOnce({ data: null } as never); // removePoi DELETE

    await removeFaq({ faq_entity_id: 6522901 });
    await removeHomeSection({ homepage_entity_id: 1381564 });
    await removePoi({ poi_entity_id: 5506041 });

    expect(reqSpy).toHaveBeenCalledTimes(4);
    const getCalls = reqSpy.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls).toHaveLength(1);
  });
});

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

  // Gap 7: addHomeSection defaults display_order and hidden when omitted
  it('addHomeSection: defaults display_order to 0 and hidden to false when omitted', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { homepage_entity_id: 1422067, title: 'No defaults', subtitle: 'sub', description: 'd', display_order: 0, hidden: false },
    } as never);

    await addHomeSection({ title: 'No defaults', subtitle: 'sub', description: 'd' });

    const body = reqSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(body.display_order).toBe(0);
    expect(body.hidden).toBe(false);
  });

  // Gap 8: removeHomeSection return content
  it('removeHomeSection: returns {removed: homepage_entity_id} in content', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: null } as never);

    const result = await removeHomeSection({ homepage_entity_id: 1381564 });

    expect(JSON.parse(result.content[0].text).removed).toBe(1381564);
  });
});

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

  // Gap 8: removePoi return content
  it('removePoi: returns {removed: poi_entity_id} in content', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_PAGES_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: null } as never);

    const result = await removePoi({ poi_entity_id: 5506041 });

    expect(JSON.parse(result.content[0].text).removed).toBe(5506041);
  });
});
