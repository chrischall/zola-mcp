import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  listCardProjects,
  getCardProject,
  validateCardProject,
  getCardProjectGuests,
  getCardSuite,
  searchCardCatalog,
  listFavoriteCardSuites,
  getRsvpPage,
  createCardProject,
  swapCardProjectVariation,
  setCardProjectGuests,
  previewCardTemplate,
  previewQrcode,
  setCardProjectQrcode,
} from '../src/tools/invitations.js';
import { setupClientMocks } from './_fixtures.js';

const PROJECT_UUID = 'c04c4ab9-32a8-425e-bbf3-397066e4a02f';
const CUSTOMIZATION_UUID = '0f6cb938-849e-4ece-9202-31ff52c8c15a';
const PAGE_UUID = '82028ec6-2525-4012-a2c2-fd3bc74c10be';
const SUITE_UUID = '546412ac-2077-4c01-af8a-1ca07090afae';
const LEAD_VARIATION_UUID = '10d9a009-5559-4e99-9a82-fbaf54891223';
const NEW_VARIATION_UUID = 'd25b5ec0-5748-4a0a-b021-8fed84b25fa1';

describe('invitation (card-project) tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tier 1 — read-only', () => {
    it('listCardProjects POSTs to search_request with default body', async () => {
      reqSpy.mockResolvedValueOnce({
        data: [{ project_uuid: PROJECT_UUID, project_name: 'Invitation - Blake Frame' }],
      } as never);

      const result = await listCardProjects(client, {});

      expect(reqSpy).toHaveBeenCalledWith(
        'POST',
        '/v3/card-projects/search_request',
        expect.objectContaining({
          completed: false,
          limit: 30,
          card_suite_uuids: [],
          card_suite_ids: [],
          offset: 0,
          fetch_customizations: true,
          include_deleted: false,
          medium: ['PAPER', 'MAGNET', 'DIGITAL'],
          single_sample: false,
        })
      );
      const payload = JSON.parse(result.content[0]!.type === 'text' ? result.content[0].text : '');
      expect(payload[0].project_uuid).toBe(PROJECT_UUID);
    });

    it('listCardProjects passes through include_completed and limit', async () => {
      reqSpy.mockResolvedValueOnce({ data: [] } as never);
      await listCardProjects(client, { include_completed: true, limit: 100 });
      const body = reqSpy.mock.calls[0]![2] as { completed: boolean; limit: number };
      expect(body.completed).toBe(true);
      expect(body.limit).toBe(100);
    });

    it('getCardProject GETs /v3/card-projects/{uuid}', async () => {
      reqSpy.mockResolvedValueOnce({ data: { uuid: PROJECT_UUID, name: 'Inv' } } as never);
      await getCardProject(client, { project_uuid: PROJECT_UUID });
      expect(reqSpy).toHaveBeenCalledWith('GET', `/v3/card-projects/${PROJECT_UUID}`);
    });

    it('validateCardProject GETs validate endpoint and returns errors envelope', async () => {
      reqSpy.mockResolvedValueOnce({
        data: {
          card_project_uuid: PROJECT_UUID,
          customizations_with_errors: [
            { customization_uuid: CUSTOMIZATION_UUID, card_type: 'INVITATION', elements_with_errors: [], guest_groups_with_errors: [] },
          ],
        },
      } as never);
      const r = await validateCardProject(client, { project_uuid: PROJECT_UUID });
      expect(reqSpy).toHaveBeenCalledWith('GET', `/v3/card-projects/${PROJECT_UUID}/validate`);
      const payload = JSON.parse(r.content[0]!.type === 'text' ? r.content[0].text : '');
      expect(payload.customizations_with_errors[0].card_type).toBe('INVITATION');
    });

    it('getCardProjectGuests GETs project-guest-groups', async () => {
      reqSpy.mockResolvedValueOnce({ data: [] } as never);
      await getCardProjectGuests(client, { project_uuid: PROJECT_UUID });
      expect(reqSpy).toHaveBeenCalledWith('GET', `/v3/card-projects/${PROJECT_UUID}/project-guest-groups`);
    });

    it('getCardSuite POSTs to v4 suites/details with no body', async () => {
      reqSpy.mockResolvedValueOnce({ data: { uuid: SUITE_UUID, name: 'Invitation - Blake Frame' } } as never);
      await getCardSuite(client, { suite_uuid: SUITE_UUID });
      expect(reqSpy).toHaveBeenCalledWith('POST', `/v4/card-catalog/suites/details/${SUITE_UUID}`);
    });

    it('searchCardCatalog defaults to INVITATION lead card type', async () => {
      reqSpy.mockResolvedValueOnce({ data: { suites: [] } } as never);
      await searchCardCatalog(client, {});
      const [, path, body] = reqSpy.mock.calls[0]!;
      expect(path).toBe('/v3/card-catalog/search/faceted');
      expect((body as { lead_card_type: string }).lead_card_type).toBe('INVITATION');
      expect((body as { limit: number }).limit).toBe(50);
    });

    it('searchCardCatalog accepts card_type override', async () => {
      reqSpy.mockResolvedValueOnce({ data: { suites: [] } } as never);
      await searchCardCatalog(client, { card_type: 'SAVE_THE_DATE', limit: 20 });
      const body = reqSpy.mock.calls[0]![2] as { lead_card_type: string; limit: number };
      expect(body.lead_card_type).toBe('SAVE_THE_DATE');
      expect(body.limit).toBe(20);
    });

    it('listFavoriteCardSuites GETs /v3/favorites/card-suites/', async () => {
      reqSpy.mockResolvedValueOnce({ data: { search_results: { suites: [] } } } as never);
      await listFavoriteCardSuites(client);
      expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/favorites/card-suites/');
    });

    it('getRsvpPage uses weddingAccountId from context', async () => {
      reqSpy.mockResolvedValueOnce({ data: { page_id: 41938923, type: 'RSVP', hidden: true } } as never);
      await getRsvpPage(client);
      expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/rsvps/wedding-accounts/4664323');
    });
  });

  describe('Tier 2 — writes', () => {
    it('createCardProject POSTs with quantity, suite, and lead variation', async () => {
      reqSpy.mockResolvedValueOnce({ data: { uuid: PROJECT_UUID, account_id: 7585875 } } as never);

      await createCardProject(client, {
        suite_uuid: SUITE_UUID,
        lead_variation_uuid: LEAD_VARIATION_UUID,
        quantity: 150,
      });

      expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/card-projects', {
        quantity: 150,
        lead_variation_uuid: LEAD_VARIATION_UUID,
        extra_customizable: false,
        account_id: 4664323,
        suite_uuid: SUITE_UUID,
      });
    });

    it('createCardProject defaults quantity to suite-typical 150', async () => {
      reqSpy.mockResolvedValueOnce({ data: {} } as never);
      await createCardProject(client, { suite_uuid: SUITE_UUID, lead_variation_uuid: LEAD_VARIATION_UUID });
      const body = reqSpy.mock.calls[0]![2] as { quantity: number };
      expect(body.quantity).toBe(150);
    });

    it('swapCardProjectVariation PUTs customizations map', async () => {
      reqSpy.mockResolvedValueOnce({ data: { uuid: PROJECT_UUID } } as never);
      await swapCardProjectVariation(client, {
        project_uuid: PROJECT_UUID,
        customizations: { [CUSTOMIZATION_UUID]: NEW_VARIATION_UUID },
      });
      expect(reqSpy).toHaveBeenCalledWith('PUT', `/v3/card-projects/${PROJECT_UUID}`, {
        customizations: {
          [CUSTOMIZATION_UUID]: { variation_uuid: NEW_VARIATION_UUID },
        },
      });
    });

    it('setCardProjectGuests PUTs guest_group_requests with overrides', async () => {
      reqSpy.mockResolvedValueOnce({ data: [] } as never);
      await setCardProjectGuests(client, {
        project_uuid: PROJECT_UUID,
        guest_groups: [
          { guest_group_id: 152644460, enabled: true, guest_name_font_size_override: 17, address_font_size_override: 10 },
          { guest_group_id: 152644417, enabled: false },
        ],
      });
      expect(reqSpy).toHaveBeenCalledWith(
        'PUT',
        `/v3/card-projects/${PROJECT_UUID}/project-guest-groups`,
        {
          guest_group_requests: [
            { guest_group_id: 152644460, enabled: true, guest_name_font_size_override: 17, address_font_size_override: 10 },
            { guest_group_id: 152644417, enabled: false },
          ],
        }
      );
    });

    it('previewCardTemplate POSTs variation_uuids + substitutions', async () => {
      reqSpy.mockResolvedValueOnce({ data: { templates_by_variation: {} } } as never);
      await previewCardTemplate(client, {
        variation_uuids: ['ee423186-65e0-49b9-8edb-763b3f703e50'],
        first_name: 'Meredith',
        last_name: 'Suffron',
        partner_first_name: 'Christopher',
        partner_last_name: 'Hall',
        wedding_date: '2026-10-17',
      });

      const body = reqSpy.mock.calls[0]![2] as {
        variation_uuids: string[];
        customizable: boolean;
        substitutions: Record<string, string>;
      };
      expect(reqSpy.mock.calls[0]![0]).toBe('POST');
      expect(reqSpy.mock.calls[0]![1]).toBe('/v3/card-templates/preview');
      expect(body.customizable).toBe(true);
      expect(body.variation_uuids).toEqual(['ee423186-65e0-49b9-8edb-763b3f703e50']);
      expect(body.substitutions).toEqual({
        first_name: 'Meredith',
        last_name: 'Suffron',
        partner_first_name: 'Christopher',
        partner_last_name: 'Hall',
        wedding_date: '2026-10-17',
      });
    });

    it('previewCardTemplate auto-populates wedding_date from context when missing', async () => {
      reqSpy.mockResolvedValueOnce({ data: {} } as never);
      await previewCardTemplate(client, {
        variation_uuids: ['v1'],
        first_name: 'Alex',
      });
      const body = reqSpy.mock.calls[0]![2] as { substitutions: Record<string, string> };
      expect(body.substitutions.wedding_date).toBe('2026-10-17');
      expect(body.substitutions.first_name).toBe('Alex');
      expect(body.substitutions).not.toHaveProperty('last_name');
    });

    it('previewCardTemplate omits substitutions entirely when none provided and context has no date', async () => {
      vi.spyOn(client, 'getContext').mockResolvedValue({
        weddingAccountId: 4664323,
        weddingId: 1,
        registryId: 'r',
        userId: 'u',
        weddingDate: null,
        weddingSlug: null,
      });
      reqSpy.mockResolvedValueOnce({ data: {} } as never);
      await previewCardTemplate(client, { variation_uuids: ['v1'] });
      const body = reqSpy.mock.calls[0]![2] as { substitutions?: Record<string, string> };
      expect(body.substitutions).toEqual({});
    });
  });

  describe('QR code', () => {
    it('previewQrcode PUTs the body and sniffs PNG magic bytes despite Zola\'s incorrect image/jpeg header', async () => {
      // Zola actually returns PNG bytes but reports content-type: image/jpeg. Sniffer overrides.
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde]);
      const binSpy = vi.spyOn(client, 'requestMobileBinary').mockResolvedValueOnce({
        bytes: png,
        contentType: 'image/jpeg',
      });

      const result = await previewQrcode(client, { url: 'https://mywedding.website' });

      expect(binSpy).toHaveBeenCalledWith('PUT', '/v3/card-projects/qrcode/preview', {
        dimension: 'MEDIUM',
        url_type: 'CUSTOM',
        enabled: true,
        url: 'https://mywedding.website',
      });
      expect(result.content).toHaveLength(1);
      const block = result.content[0]!;
      expect(block.type).toBe('image');
      if (block.type === 'image') {
        expect(block.mimeType).toBe('image/png');
        expect(block.data).toBe(Buffer.from(png).toString('base64'));
      }
    });

    it('previewQrcode falls back to server content-type when bytes don\'t match a known magic', async () => {
      vi.spyOn(client, 'requestMobileBinary').mockResolvedValueOnce({
        bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
        contentType: 'image/svg+xml',
      });
      const r = await previewQrcode(client, { url: 'https://x' });
      const block = r.content[0]!;
      if (block.type === 'image') expect(block.mimeType).toBe('image/svg+xml');
    });

    it('previewQrcode accepts dimension and url_type overrides', async () => {
      const binSpy = vi.spyOn(client, 'requestMobileBinary').mockResolvedValueOnce({
        bytes: new Uint8Array([0]),
        contentType: 'image/png',
      });
      await previewQrcode(client, {
        url: 'https://x',
        dimension: 'LARGE',
        url_type: 'WEDDING_WEBSITE_RSVP',
        enabled: false,
      });
      expect(binSpy).toHaveBeenCalledWith('PUT', '/v3/card-projects/qrcode/preview', {
        dimension: 'LARGE',
        url_type: 'WEDDING_WEBSITE_RSVP',
        enabled: false,
        url: 'https://x',
      });
    });

    it('setCardProjectQrcode PUTs to project/customization/page/qrcode', async () => {
      reqSpy.mockResolvedValueOnce({ data: { uuid: 'qr-element' } } as never);

      await setCardProjectQrcode(client, {
        project_uuid: PROJECT_UUID,
        page_uuid: PAGE_UUID,
        url: 'https://www.zola.com/wedding/foo/rsvp',
        url_type: 'WEDDING_WEBSITE_RSVP',
      });

      expect(reqSpy).toHaveBeenCalledWith(
        'PUT',
        `/v3/card-projects/${PROJECT_UUID}/customization/page/${PAGE_UUID}/qrcode`,
        {
          dimension: 'MEDIUM',
          url_type: 'WEDDING_WEBSITE_RSVP',
          color: '000000',
          enabled: true,
          url: 'https://www.zola.com/wedding/foo/rsvp',
        }
      );
    });
  });
});
