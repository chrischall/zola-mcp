import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

const collectionIdCache = new Map<string, string>();

/** Test-only: clear the cache between tests. */
export function _resetRegistryCollectionCache(): void {
  collectionIdCache.clear();
}

interface RegistryShape {
  data: {
    groups?: Array<{
      modules?: Array<{ type?: string; id?: string }>;
    }>;
    default_collection_id?: string;
  };
}

async function getDefaultCollectionId(registryId: string): Promise<string> {
  const cached = collectionIdCache.get(registryId);
  if (cached !== undefined) return cached;
  const response = await client.requestMobile<RegistryShape>(
    'GET',
    `/v4/shop/registry?registry_id=${registryId}&updated_modules=true`
  );
  let collectionId = response.data.default_collection_id;
  if (!collectionId) {
    for (const group of response.data.groups ?? []) {
      for (const mod of group.modules ?? []) {
        if (mod.type === 'COLLECTION' && mod.id) {
          collectionId = mod.id;
          break;
        }
      }
      if (collectionId) break;
    }
  }
  if (!collectionId) {
    throw new Error('Could not determine default collection ID for registry');
  }
  collectionIdCache.set(registryId, collectionId);
  return collectionId;
}

export async function searchRegistryProducts(args: {
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
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addRegistryItem(args: {
  sku_id: string;
  collection_id?: string;
  quantity?: number;
  most_wanted?: boolean;
  enable_group_gifting?: boolean;
}): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const collectionId = args.collection_id ?? (await getDefaultCollectionId(registryId));
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
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateRegistryItem(args: {
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
    `/v3/registries/${registryId}/items/${args.collection_item_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeRegistryItem(args: { collection_item_id: string }): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  await client.requestMobile<MobileEnvelope<unknown>>(
    'DELETE',
    `/v3/registries/${registryId}/items/${args.collection_item_id}`
  );
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.collection_item_id }) }] };
}

export function registerRegistryItemTools(server: McpServer): void {
  server.tool(
    'search_registry_products',
    'Browse Zola products in a category, scoped to your registry. Use category IDs from get_registry.',
    {
      category_id: z.number().describe('Zola product category ID'),
      offset: z.number().optional().describe('Default 0'),
      limit: z.number().optional().describe('Default 50'),
    },
    searchRegistryProducts
  );

  server.tool(
    'add_registry_item',
    'Add a product (by SKU) to the registry. If collection_id is omitted, the default collection is looked up automatically.',
    {
      sku_id: z.string().describe('Product SKU ID (e.g., from search_registry_products)'),
      collection_id: z.string().optional().describe("Collection to add into; defaults to the registry's default collection"),
      quantity: z.number().optional().describe('Default 1'),
      most_wanted: z.boolean().optional().describe('Mark as a most-wanted gift. Default false'),
      enable_group_gifting: z.boolean().optional().describe('Allow multiple guests to chip in. Default false'),
    },
    addRegistryItem
  );

  server.tool(
    'update_registry_item',
    "Update an existing registry item — all fields must be supplied (it's a full replace)",
    {
      collection_item_id: z.string().describe('Item ID from get_registry'),
      collection_id: z.string().describe('Collection the item belongs to'),
      quantity: z.number(),
      group_gift: z.boolean(),
      marked_fulfilled: z.boolean(),
      personal_note: z.string(),
      most_wanted: z.boolean(),
    },
    updateRegistryItem
  );

  server.tool(
    'remove_registry_item',
    'Remove an item from the registry',
    { collection_item_id: z.string() },
    removeRegistryItem
  );
}
