// The local confirmWrite is an adapter over mcp-utils' confirmWrite kit
// (fleet-audit #1364). These pin what the kit adds over the old private copy:
// the preview the user was shown is bound into the token, and a withheld body
// is still bound even though it is not echoed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { confirmWrite } from '../src/tools/_confirm.js';
import { NO_ELICIT_CTX, snapshotConfirmEnv, restoreConfirmEnv } from './_confirm-helpers.js';

function parse(result: unknown): Record<string, any> {
  return JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
}

const base = {
  tool: 'remove_faq',
  action: 'zola.faq.remove',
  label: 'Remove FAQ "Where do we park?"',
  method: 'DELETE',
  path: '/v3/websites/faqs/1',
  target: '1',
  args: { faq_id: 1 },
};

describe('confirmWrite adapter', () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = snapshotConfirmEnv();
  });
  afterEach(() => restoreConfirmEnv(saved));

  it('refuses a token when the preview shown in phase 1 has changed', async () => {
    const one = parse(await confirmWrite(NO_ELICIT_CTX, { ...base, about: { answer: 'north lot' }, confirmToken: undefined }));
    expect(one.status).toBe('confirmation-required');
    const two = await confirmWrite(NO_ELICIT_CTX, { ...base, about: { answer: 'south lot' }, confirmToken: one.confirmToken });
    expect(two).toBeDefined();
    expect(JSON.stringify(two)).toMatch(/DRAFT_CHANGED/);
  });

  it('proceeds when nothing changed', async () => {
    const one = parse(await confirmWrite(NO_ELICIT_CTX, { ...base, about: { answer: 'north lot' }, confirmToken: undefined }));
    expect(await confirmWrite(NO_ELICIT_CTX, { ...base, about: { answer: 'north lot' }, confirmToken: one.confirmToken })).toBeUndefined();
  });

  it('withholds a showBody:false body from the preview but still binds it', async () => {
    const call = (body: unknown, confirmToken?: string) =>
      confirmWrite(NO_ELICIT_CTX, { ...base, method: 'PUT', body, showBody: false, confirmToken });
    const one = parse(await call({ address1: '1 Example Street' }));
    expect(JSON.stringify(one.preview)).not.toContain('Example Street');
    expect(one.preview.willSend).toMatch(/withheld/);
    const two = await call({ address1: '2 Other Street' }, one.confirmToken);
    expect(JSON.stringify(two)).toMatch(/DRAFT_CHANGED/);
  });
});
