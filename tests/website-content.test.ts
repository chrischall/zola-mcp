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
