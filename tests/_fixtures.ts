import { vi } from 'vitest';
import { client } from '../src/client.js';
import type { UserContext } from '../src/client.js';

export const MOCK_CTX: UserContext = {
  weddingAccountId: 1000001,
  weddingId: 7585869,
  registryId: 'registry-1',
  userId: 'user-1',
  weddingDate: '2026-10-17',
  weddingSlug: 'alexjordan2026',
};

/**
 * Spy on `client.requestMobile` and stub `client.getContext` with the provided
 * context (default: MOCK_CTX). Returns the request spy for setting per-test
 * `mockResolvedValueOnce` chains. Pair with `vi.restoreAllMocks()` in `afterEach`.
 */
export function setupClientMocks(ctx: UserContext = MOCK_CTX) {
  const reqSpy = vi.spyOn(client, 'requestMobile');
  vi.spyOn(client, 'getContext').mockResolvedValue(ctx);
  return reqSpy;
}
