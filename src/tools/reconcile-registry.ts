import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';
import { fetchRegistryCollection, type RegistryItem } from '../registry-collection.js';
import { isSameProduct, normalizeProductName, similarity } from '../name-match.js';

/**
 * Joining Zola's two independent views of the same gift.
 *
 * - `gift_tracker` is ORDER-shaped: who paid, when, how much.
 * - the registry collection is ITEM-shaped: what was asked for, what is claimed.
 *
 * An item can be claimed with no order behind it — bought directly at the
 * retailer and synced back, or ticked off by hand. Then it has no giver, no
 * value and no tracker row, and nothing in either view says so on its own.
 * Surfacing that is the point of this tool.
 *
 * Strictly read-only: it issues GETs and never touches
 * `PUT /v3/registries/{id}/items/{itemId}` or any other write.
 */

/** One purchased line item, flattened out of the order → container nesting. */
export interface TrackerLine {
  order_id: string | null;
  order_number: number | null;
  order_item_id: string | null;
  giver_name: string | null;
  giver_email: string | null;
  order_date: number | null;
  gift_message: string | null;
  product_name: string | null;
  store_name: string | null;
  price_cents: number | null;
  quantity: number;
  product_url: string | null;
  type: string | null;
  confirmed_at: number | null;
}

interface RawTrackerItem {
  order_item_id?: string | null;
  order_number?: number | null;
  quantity?: number | null;
  price_cents?: number | null;
  type?: string | null;
  product_name?: string | null;
  display_name?: string | null;
  store_name?: string | null;
  product_url?: string | null;
  confirmed_at?: number | null;
  item_id?: string | null;
  sku_object_id?: string | null;
  image_links?: Record<string, string> | null;
  [key: string]: unknown;
}

interface RawOrderGroup {
  order_object_id?: string | null;
  order_number?: number | null;
  order_date?: number | null;
  gift_giver_name?: string | null;
  gift_giver_email?: string | null;
  gift_message?: string | null;
  containers?: Array<{ type?: string | null; items?: RawTrackerItem[] | null }> | null;
}

interface RawGiftTracker {
  order_groups?: RawOrderGroup[] | null;
  info_modules?: unknown;
  [key: string]: unknown;
}

/**
 * Flatten `order_groups[].containers[].items[]` into one row per purchased
 * item, carrying the giver down from the order group.
 *
 * `image_links` is dropped here — it is ~15 keys per item that are all the same
 * base URL with different `w`/`h` params, and it is the reason the tracker
 * response is two orders of magnitude larger than its information content.
 */
export function flattenGiftTracker(payload: RawGiftTracker): TrackerLine[] {
  const lines: TrackerLine[] = [];
  for (const group of payload?.order_groups ?? []) {
    for (const container of group.containers ?? []) {
      for (const item of container.items ?? []) {
        lines.push({
          order_id: group.order_object_id ?? null,
          order_number: item.order_number ?? group.order_number ?? null,
          order_item_id: item.order_item_id ?? null,
          giver_name: group.gift_giver_name ?? null,
          giver_email: group.gift_giver_email ?? null,
          order_date: typeof group.order_date === 'number' ? group.order_date : null,
          gift_message: group.gift_message ?? null,
          product_name: item.product_name ?? item.display_name ?? null,
          store_name: item.store_name ?? null,
          price_cents: typeof item.price_cents === 'number' ? item.price_cents : null,
          // CASH contributions carry no quantity; one contribution is one gift.
          quantity: typeof item.quantity === 'number' ? item.quantity : 1,
          product_url: item.product_url ?? null,
          type: item.type ?? null,
          confirmed_at: typeof item.confirmed_at === 'number' ? item.confirmed_at : null,
        });
      }
    }
  }
  return lines;
}

/**
 * A cash fund: one registry item that accumulates many contributions.
 *
 * Both the join and the bucketing need this, and they disagreed before — the
 * join treated `type === 'CASH'` as a fund while `UNATTRIBUTED` only checked
 * `cash_fund`, so a fund that set only `type` was never claimed yet was still
 * eligible to be reported unattributed.
 */
function isCashFund(item: RegistryItem): boolean {
  return item.cash_fund || item.type === 'CASH';
}

/** Ids a tracker line might use to name the registry item it came from. */
function trackerLineIds(raw: RawTrackerItem): string[] {
  return [raw.item_id, raw.sku_object_id].filter((v): v is string => typeof v === 'string' && v !== '');
}

/**
 * Link tracker lines to registry items: item id first, normalized product name
 * as a fallback, one-to-one so a single registry item cannot absorb two orders.
 */
export function joinTrackerToRegistry(
  registryItems: RegistryItem[],
  lines: TrackerLine[],
  rawLineIds: string[][] = []
): {
  matches: Map<number, RegistryItem>;
  orphanOrders: TrackerLine[];
  matchedBy: Map<number, 'item_id' | 'product_name'>;
} {
  const matches = new Map<number, RegistryItem>();
  const matchedBy = new Map<number, 'item_id' | 'product_name'>();
  const claimed = new Set<RegistryItem>();

  // Matching is one-to-one for physical goods, so two orders cannot collapse
  // onto one registry item. A cash fund is the exception: it is a single
  // registry item that legitimately receives many contributions, so it is never
  // marked claimed. Without this, the second contributor to a honeymoon fund
  // lands in ORPHAN_ORDER and reads as a data error.
  const claim = (item: RegistryItem) => {
    if (!isCashFund(item)) claimed.add(item);
  };

  const byId = new Map<string, RegistryItem>();
  for (const item of registryItems) {
    if (item.item_id) byId.set(item.item_id, item);
    if (item.sku_id) byId.set(item.sku_id, item);
  }

  // Pass 1 — exact item id.
  lines.forEach((line, index) => {
    const ids = [...(rawLineIds[index] ?? []), line.order_item_id ?? ''].filter(Boolean);
    for (const id of ids) {
      const hit = byId.get(id);
      if (hit && !claimed.has(hit)) {
        claim(hit);
        matches.set(index, hit);
        matchedBy.set(index, 'item_id');
        return;
      }
    }
  });

  // Pass 2 — exact normalized name, before any fuzzy pass, so a near-miss can
  // never steal an item that some other line names exactly.
  lines.forEach((line, index) => {
    if (matches.has(index)) return;
    const target = normalizeProductName(line.product_name);
    if (target === '') return;
    for (const item of registryItems) {
      if (claimed.has(item)) continue;
      if (normalizeProductName(item.name) === target) {
        claim(item);
        matches.set(index, item);
        matchedBy.set(index, 'product_name');
        return;
      }
    }
  });

  // Pass 3 — fuzzy name, above threshold only.
  lines.forEach((line, index) => {
    if (matches.has(index)) return;
    let best: RegistryItem | null = null;
    let bestScore = 0;
    for (const item of registryItems) {
      if (claimed.has(item)) continue;
      const score = similarity(line.product_name, item.name);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (best && isSameProduct(line.product_name, best.name)) {
      claim(best);
      matches.set(index, best);
      matchedBy.set(index, 'product_name');
    }
  });

  const orphanOrders = lines.filter((_, index) => !matches.has(index));
  return { matches, orphanOrders, matchedBy };
}

export interface ReconcileReport {
  generated_at: number;
  registry_key: string;
  source: string;
  totals: {
    registry_items: number;
    tracker_lines: number;
  };
  buckets: {
    DUPLICATE_RISK: unknown[];
    UNATTRIBUTED: unknown[];
    ORPHAN_ORDER: unknown[];
    MATCHED: number;
  };
}

export async function reconcileRegistry(
  client: ZolaClient,
  args: { limit?: number; offset?: number } = {}
): Promise<ToolResult> {
  const { registryId } = await client.getContext();

  // Registry read. Throws RegistryReadError with the failing step rather than
  // returning an empty collection — an empty read here is indistinguishable
  // from "nothing was purchased", which is the worst possible wrong answer.
  const collection = await fetchRegistryCollection(client, {
    limit: args.limit ?? 500,
    offset: args.offset ?? 0,
  });

  const trackerResponse = await client.requestMobile<MobileEnvelope<RawGiftTracker>>(
    'GET',
    `/v3/gift_tracker/${registryId}`
  );
  const rawGroups = trackerResponse.data?.order_groups ?? [];
  const lines = flattenGiftTracker(trackerResponse.data);
  const rawLineIds: string[][] = [];
  for (const group of rawGroups) {
    for (const container of group.containers ?? []) {
      for (const item of container.items ?? []) rawLineIds.push(trackerLineIds(item));
    }
  }

  const { matches, orphanOrders, matchedBy } = joinTrackerToRegistry(
    collection.items,
    lines,
    rawLineIds
  );

  // Mark attribution on the items an order actually reached.
  const attributed = new Set<RegistryItem>(matches.values());
  for (const item of collection.items) {
    item.purchase_state.attributed = attributed.has(item);
  }

  const duplicateRisk = collection.items
    .filter((item) => item.purchase_state.inconsistent)
    .map((item) => ({
      item_id: item.item_id,
      name: item.name,
      store_name: item.store_name,
      price_cents: item.price_cents,
      requested_qty: item.purchase_state.requested_qty,
      purchased_qty: item.purchase_state.purchased_qty,
      marked_fulfilled: item.purchase_state.marked_fulfilled,
      availability: item.purchase_state.availability,
      product_url: item.product_url,
      impact:
        'flagged fulfilled but nothing has been purchased — the item still shows as ' +
        'available, so another guest can buy it',
    }))
    .sort((a, b) => (b.price_cents ?? 0) - (a.price_cents ?? 0));

  const unattributed = collection.items
    .filter(
      (item) =>
        item.purchase_state.purchased_qty > 0 &&
        !item.purchase_state.attributed &&
        !isCashFund(item)
    )
    .map((item) => ({
      item_id: item.item_id,
      name: item.name,
      store_name: item.store_name,
      price_cents: item.price_cents,
      requested_qty: item.purchase_state.requested_qty,
      purchased_qty: item.purchase_state.purchased_qty,
      marked_fulfilled: item.purchase_state.marked_fulfilled,
      availability: item.purchase_state.availability,
      registry_import: item.registry_import,
      product_url: item.product_url,
      impact:
        'purchased, but no gift_tracker order references it — giver and value are ' +
        'both unknown' +
        (item.registry_import ? ' (retailer-synced item; likely bought in-store)' : ''),
    }))
    .sort((a, b) => (b.price_cents ?? 0) - (a.price_cents ?? 0));

  const orphans = orphanOrders.map((line) => ({
    order_id: line.order_id,
    order_number: line.order_number,
    giver_name: line.giver_name,
    giver_email: line.giver_email,
    order_date: line.order_date,
    product_name: line.product_name,
    price_cents: line.price_cents,
    quantity: line.quantity,
    type: line.type,
    impact:
      line.type === 'CASH'
        ? 'cash contribution — expected to have no registry item behind it'
        : 'an order exists but no registry item matches it',
  }));

  const report: ReconcileReport = {
    generated_at: Date.now(),
    registry_key: collection.registry_key,
    source: collection.source,
    totals: {
      registry_items: collection.total,
      tracker_lines: lines.length,
    },
    buckets: {
      DUPLICATE_RISK: duplicateRisk,
      UNATTRIBUTED: unattributed,
      ORPHAN_ORDER: orphans,
      MATCHED: matches.size,
    },
  };

  return jsonResult({
    ...report,
    matched_by: {
      item_id: [...matchedBy.values()].filter((v) => v === 'item_id').length,
      product_name: [...matchedBy.values()].filter((v) => v === 'product_name').length,
    },
  });
}

export function registerReconcileTools(server: McpServer, client: ZolaClient): void {
  server.registerTool(
    'reconcile_registry',
    {
      description:
        'Reconcile the registry against the gift tracker. Returns DUPLICATE_RISK ' +
        '(flagged fulfilled but purchased count is 0 — still buyable), UNATTRIBUTED ' +
        '(purchased with no order behind it, so giver and value are lost), ' +
        'ORPHAN_ORDER (an order with no matching registry item) and a MATCHED count. ' +
        'Read-only.',
      annotations: { readOnlyHint: true },
    },
    () => reconcileRegistry(client)
  );
}
