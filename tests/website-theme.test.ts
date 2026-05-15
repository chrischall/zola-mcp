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

  it('updateWebsiteCustomization: merges body_font_color and body_font_family_id into one object', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateWebsiteCustomization({ body_font_color: '000000', body_font_family_id: 42 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      body_font: { color: '000000', font_family_id: 42 },
    });
  });

  it('updateWebsiteCustomization: sets header_font when header_font_family_id provided', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateWebsiteCustomization({ header_font_family_id: 7 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      header_font: { font_family_id: 7 },
    });
  });
});
