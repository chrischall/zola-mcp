import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';

const collectionIdCache = new Map<string, string>();

/** Test-only: clear the cache between tests. */
export function _resetRegistryCollectionCache(): void {
  collectionIdCache.clear();
}

/** `GET /v3/registries/{id}` — registry metadata, ~1.3 KB. */
interface RegistryMetaShape {
  data?: {
    default_collection_id?: string | null;
    collection_ids?: string[] | null;
  } | null;
}

/**
 * Resolve the registry's default collection id.
 *
 * This reads `GET /v3/registries/{id}`, **not** `GET /v4/shop/registry`.
 *
 * The shop endpoint was the original source and could never have worked: it
 * returns the Shop *browse* page (~4 MB of SEARCH / CIRCLE_GRID /
 * SHOP_ENTITIES_CAROUSEL / PARTNER_RETAILERS modules) and carries neither a
 * `default_collection_id` field nor any module of type `COLLECTION`. Both the
 * primary lookup and its group-scanning fallback therefore resolved to
 * `undefined` on every call, so `add_registry_item` threw "Could not determine
 * default collection ID" any time the caller omitted `collection_id` — while
 * also downloading 4 MB to fail. Verified against the live account 2026-08-01.
 *
 * `/v3/registries/{id}` returns the id directly and costs ~1.3 KB.
 */
async function getDefaultCollectionId(client: ZolaClient, registryId: string): Promise<string> {
  const cached = collectionIdCache.get(registryId);
  if (cached !== undefined) return cached;

  const response = await client.requestMobile<RegistryMetaShape>(
    'GET',
    `/v3/registries/${registryId}`
  );

  const collectionId =
    response.data?.default_collection_id ||
    response.data?.collection_ids?.find((id) => typeof id === 'string' && id !== '');

  if (!collectionId) {
    throw new Error(
      `Could not determine the default collection ID for registry ${registryId}: ` +
        `GET /v3/registries/${registryId} returned no default_collection_id and no ` +
        'collection_ids. Pass collection_id explicitly to work around this.'
    );
  }

  collectionIdCache.set(registryId, collectionId);
  return collectionId;
}

export async function searchRegistryProducts(client: ZolaClient, args: {
  category_id: number;
  offset?: number;
  limit?: number;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const body = {
    offset: args.offset ?? 0,
    limit: args.limit ?? 50,
    registry_id: registryId,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    `/v3/categories/${args.category_id}/entities`,
    body
  );
  return jsonResult(response.data);
}

export async function addRegistryItem(client: ZolaClient, args: {
  sku_id: string;
  collection_id?: string;
  quantity?: number;
  most_wanted?: boolean;
  enable_group_gifting?: boolean;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const collectionId = args.collection_id ?? (await getDefaultCollectionId(client, registryId));
  const body = {
    sku_id: args.sku_id,
    quantity: args.quantity ?? 1,
    most_wanted: args.most_wanted ?? false,
    enable_group_gifting: args.enable_group_gifting ?? false,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    `/v3/registries/${registryId}/collections/${collectionId}`,
    body
  );
  return jsonResult(response.data);
}

export async function updateRegistryItem(client: ZolaClient, args: {
  collection_item_id: string;
  collection_id: string;
  quantity: number;
  group_gift: boolean;
  marked_fulfilled: boolean;
  personal_note: string;
  most_wanted: boolean;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const body = {
    quantity: args.quantity,
    group_gift: args.group_gift,
    marked_fulfilled: args.marked_fulfilled,
    personal_note: args.personal_note,
    most_wanted: args.most_wanted,
    collection_id: args.collection_id,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/registries/${registryId}/items/${encodeURIComponent(args.collection_item_id)}`,
    body
  );
  return jsonResult(response.data);
}

export async function removeRegistryItem(client: ZolaClient, args: { collection_item_id: string }): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  await client.requestMobile<MobileEnvelope<unknown>>(
    'DELETE',
    `/v3/registries/${registryId}/items/${encodeURIComponent(args.collection_item_id)}`
  );
  return jsonResult({ removed: args.collection_item_id });
}

export function registerRegistryItemTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('search_registry_products', {
    description: 'Browse Zola products in a category, scoped to your registry. Category IDs are Zola constants (e.g. 544 = Kitchen) — exposed via GET /v3/categories in the iOS app.',
    inputSchema: {
      category_id: z.number().describe('Zola product category ID'),
      offset: z.number().optional().describe('Default 0'),
      limit: z.number().optional().describe('Default 50'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => searchRegistryProducts(client, args));

  server.registerTool('add_registry_item', {
    description: 'Add a product (by SKU) to the registry. If collection_id is omitted, the default collection is looked up automatically.',
    inputSchema: {
      sku_id: z.string().describe('Product SKU ID (e.g., from search_registry_products)'),
      collection_id: z.string().optional().describe("Collection to add into; defaults to the registry's default collection"),
      quantity: z.number().optional().describe('Default 1'),
      most_wanted: z.boolean().optional().describe('Mark as a most-wanted gift. Default false'),
      enable_group_gifting: z.boolean().optional().describe('Allow multiple guests to chip in. Default false'),
    },
    annotations: { destructiveHint: false },
  }, (args) => addRegistryItem(client, args));

  server.registerTool('update_registry_item', {
    description: "Update an existing registry item — all fields must be supplied (it's a full replace)",
    inputSchema: {
      collection_item_id: z.string().describe('Item ID from get_registry'),
      collection_id: z.string().describe('Collection the item belongs to'),
      quantity: z.number(),
      group_gift: z.boolean(),
      marked_fulfilled: z.boolean(),
      personal_note: z.string(),
      most_wanted: z.boolean(),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateRegistryItem(client, args));

  server.registerTool('remove_registry_item', {
    description: 'Remove an item from the registry',
    inputSchema: {
      collection_item_id: z.string(),
    },
    annotations: { destructiveHint: true },
  }, (args) => removeRegistryItem(client, args));
}
