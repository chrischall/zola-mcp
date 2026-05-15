import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  listPages,
  setPageHidden,
  reorderPages,
  updatePage,
  getWeddingSettings,
  updateWeddingSettings,
} from '../src/tools/website.js';

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

    // Gap 2: untouched fields are preserved from current wedding
    const putBody = reqSpy.mock.calls[1][2] as Record<string, unknown>;
    expect(putBody.owner_first_name).toBe('Meredith');
    expect(putBody.owner_last_name).toBe('Suffron');
    expect(putBody.enable_search_engine).toBe(false);
    expect(putBody.enable_search_zola).toBe(false);
    expect(putBody.guest_count).toBe(100);
    expect(putBody.city).toBe('Charlotte');
    expect(putBody.state_province).toBe('NC');
  });

  // Gap 1: hashtag ?? current.hashtag ?? '' double-fallback when current.hashtag is null
  it('updateWeddingSettings: produces empty string for hashtag when neither arg nor current has one', async () => {
    const ctxWithNullHashtag = {
      data: { ...MOCK_CONTEXT_RESPONSE.data, wedding: { ...MOCK_CONTEXT_RESPONSE.data.wedding, hashtag: null } },
    };
    reqSpy.mockResolvedValueOnce(ctxWithNullHashtag as never);
    reqSpy.mockResolvedValueOnce({ data: ctxWithNullHashtag.data.wedding } as never);

    await updateWeddingSettings({ title: 'X' }); // no hashtag arg

    const putBody = reqSpy.mock.calls[1][2] as Record<string, unknown>;
    expect(putBody.hashtag).toBe('');
  });

  // Gap 3: boolean-false passthrough — enable_search_engine: true overrides current false
  it('updateWeddingSettings: passes enable_search_engine: true through ?? merge correctly', async () => {
    // current has enable_search_engine: false; caller passes true
    reqSpy.mockResolvedValueOnce(MOCK_CONTEXT_RESPONSE as never);
    reqSpy.mockResolvedValueOnce({ data: MOCK_CONTEXT_RESPONSE.data.wedding } as never);

    await updateWeddingSettings({ enable_search_engine: true });

    const putBody = reqSpy.mock.calls[1][2] as Record<string, unknown>;
    expect(putBody.enable_search_engine).toBe(true);
  });
});
