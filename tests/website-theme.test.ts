import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  getCurrentTheme,
  getWebsiteCustomizations,
  searchThemes,
  updateCurrentTheme,
  updateWebsiteCustomization,
} from '../src/tools/website-theme.js';
import { setupClientMocks } from './_fixtures.js';

describe('website-theme tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getWebsiteCustomizations: GETs /v3/websites/website-customizations/context', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { customization_view: { theme_key: 'galata' } },
    } as never);
    const result = await getWebsiteCustomizations(client);
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/website-customizations/context');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.customization_view.theme_key).toBe('galata');
  });

  it('getCurrentTheme: GETs /v3/themes/current', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { key: 'galata', name: 'Galata', swatch_color: 'FFFFFF' },
    } as never);
    const result = await getCurrentTheme(client);
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/themes/current');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.key).toBe('galata');
  });

  it('searchThemes: POSTs search criteria with defaults', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { offset: 0, limit: 50, total: 50, displayable_total: 1532, themes: [] },
    } as never);
    await searchThemes(client, {});
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/themes/search', {
      limit: 50,
      offset: 0,
      theme_layout_types: ['MULTI_PAGE'],
    });
  });

  it('searchThemes: honors provided overrides', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await searchThemes(client, { limit: 20, offset: 40, theme_layout_types: ['SINGLE_PAGE'] });
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
    const result = await updateCurrentTheme(client, { theme_key: 'galata', theme_layout_type: 'MULTI_PAGE' });
    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/themes/current', {
      theme_key: 'galata',
      theme_layout_type: 'MULTI_PAGE',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.key).toBe('galata');
  });

  it('updateCurrentTheme: defaults layout_type to MULTI_PAGE when omitted', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateCurrentTheme(client, { theme_key: 'blake-cranberry' });
    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/themes/current', {
      theme_key: 'blake-cranberry',
      theme_layout_type: 'MULTI_PAGE',
    });
  });

  it('updateWebsiteCustomization: POSTs only the fields provided', async () => {
    reqSpy.mockResolvedValueOnce({ data: { customization_view: {} } } as never);
    await updateWebsiteCustomization(client, {
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
    await updateWebsiteCustomization(client, {
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
    await updateWebsiteCustomization(client, { body_font_color: '000000', body_font_family_id: 68 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      body_font: { color: '000000', font_family_id: 68 },
    });
  });

  it('updateWebsiteCustomization: sets header_font when header_font_family_id provided', async () => {
    // When header_font_family_id changes, the wrapper bundles current colors to
    // defend against the partial-update wipe bug (see docs/zola-api-quirks.md).
    // Mock the GET that fetches current state, then assert the POST body.
    reqSpy
      .mockResolvedValueOnce({
        data: {
          current_style_customizations: {
            accent_color: 'B20033',
            background_color: 'FFFFFF',
            body: { color: '111111', id: 68 },
            navigation_customization: { background_color: 'B51A00' },
          },
        },
      } as never)
      .mockResolvedValueOnce({ data: {} } as never);

    await updateWebsiteCustomization(client, { header_font_family_id: 7 });

    expect(reqSpy).toHaveBeenNthCalledWith(
      1,
      'GET',
      '/v3/websites/website-customizations/context'
    );
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/v3/websites/website-customizations/context',
      {
        header_font: { font_family_id: 7 },
        accent_color: 'B20033',
        background_color: 'FFFFFF',
        body_font: { color: '111111' },
        navigation_customization: { background_color: 'B51A00' },
      }
    );
  });

  it('updateWebsiteCustomization: bundles preserved fields only when header_font_family_id changes', async () => {
    // Simple color change should NOT trigger the bundling/fetch path.
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateWebsiteCustomization(client, { accent_color: 'ABCDEF' });
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      accent_color: 'ABCDEF',
    });
  });

  it('updateWebsiteCustomization: regression — wipe bug is neutralised by the wrapper', async () => {
    // This mock simulates the Zola wipe bug: when the POST body contains
    // header_font but omits other colors, the server resets them to null.
    // The wrapper must include the preserved colors so the wipe never triggers.
    const wipeMock = (method: string, _path: string, body?: Record<string, unknown>) => {
      if (method === 'GET') {
        return Promise.resolve({
          data: {
            current_style_customizations: {
              accent_color: 'B20033',
              background_color: 'FFFFFF',
              body: { color: '111111', id: 68 },
              navigation_customization: { background_color: 'B51A00' },
            },
          },
        } as never);
      }
      const hasHeaderFont = body && 'header_font' in body;
      const hasAccent = body && 'accent_color' in body;
      const hasBackground = body && 'background_color' in body;
      const hasBodyFontColor =
        body && body.body_font && (body.body_font as Record<string, unknown>).color !== undefined;
      const hasNav =
        body &&
        body.navigation_customization &&
        (body.navigation_customization as Record<string, unknown>).background_color !== undefined;

      // Reproduce the wipe: if header_font is changed but accompanying colors are
      // missing from the body, the server returns them as null.
      const wiped = hasHeaderFont && !(hasAccent && hasBackground && hasBodyFontColor && hasNav);
      return Promise.resolve({
        data: {
          current_style_customizations: {
            accent_color: wiped ? null : 'B20033',
            background_color: wiped ? null : 'FFFFFF',
            body: { color: wiped ? null : '111111', id: 68 },
            navigation_customization: {
              background_color: wiped ? null : 'B51A00',
            },
          },
        },
      } as never);
    };
    reqSpy.mockImplementation(wipeMock as never);

    const result = await updateWebsiteCustomization(client, { header_font_family_id: 7 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.current_style_customizations.accent_color).toBe('B20033');
    expect(parsed.current_style_customizations.background_color).toBe('FFFFFF');
    expect(parsed.current_style_customizations.body.color).toBe('111111');
    expect(parsed.current_style_customizations.navigation_customization.background_color).toBe(
      'B51A00'
    );
  });

  it('updateWebsiteCustomization: rejects body_font_family_id outside the allowed set [68, 198]', async () => {
    await expect(
      updateWebsiteCustomization(client, { body_font_family_id: 70 })
    ).rejects.toThrow(/body_font_family_id.*68.*198/);
    expect(reqSpy).not.toHaveBeenCalled();
  });

  it('updateWebsiteCustomization: accepts body_font_family_id=68 (Libre Baskerville)', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateWebsiteCustomization(client, { body_font_family_id: 68 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      body_font: { font_family_id: 68 },
    });
  });

  it('updateWebsiteCustomization: accepts body_font_family_id=198 (Circular)', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await updateWebsiteCustomization(client, { body_font_family_id: 198 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/websites/website-customizations/context', {
      body_font: { font_family_id: 198 },
    });
  });

  it('updateWebsiteCustomization: rejects header_color (web-api only) with a clear error', async () => {
    await expect(
      updateWebsiteCustomization(client, { header_color: '000000' } as never)
    ).rejects.toThrow(/header_color.*not writable via the mobile-api/);
    expect(reqSpy).not.toHaveBeenCalled();
  });

  it('updateWebsiteCustomization: rejects nav_font_color (web-api only) with a clear error', async () => {
    await expect(
      updateWebsiteCustomization(client, { nav_font_color: '000000' } as never)
    ).rejects.toThrow(/nav_font_color.*not writable via the mobile-api/);
    expect(reqSpy).not.toHaveBeenCalled();
  });
});
