import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface BudgetPayment {
  uuid: string;
  budget_item_uuid: string;
  payment_type: string;
  amount_cents: number;
  note: string | null;
  paid_at: number | null;
  due_at: number | null;
  remind_at: number | null;
}

interface BudgetItem {
  uuid: string;
  taxonomy_node_uuid: string;
  title: string;
  cost_cents: number;
  estimate: boolean;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  item_type: string | { key: string; display_name: string };
  paid_cents: number;
  note: string | null;
  payments: BudgetPayment[];
  account_vendor_uuid?: string | null;
}

interface TaxonomyNode {
  title: string;
  items: BudgetItem[];
}

interface Budget {
  uuid: string;
  budgeted_cents: number;
  cost_cents: number;
  actual_cost_cents?: number;
  paid_cents: number;
  balance_due_cents: number;
  taxonomy_nodes: TaxonomyNode[];
}

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

function itemTypeKey(item_type: string | { key: string }): string {
  return typeof item_type === 'string' ? item_type : item_type.key;
}

export async function getBudget(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<Budget>>('GET', '/v3/budgets');
  const budget = response.data;
  const items = budget.taxonomy_nodes.flatMap((node) =>
    node.items.map((item) => ({
      uuid: item.uuid,
      taxonomy_node_uuid: item.taxonomy_node_uuid,
      title: item.title,
      item_type: itemTypeKey(item.item_type),
      cost_cents: item.cost_cents,
      estimated_cost_cents: item.estimated_cost_cents,
      actual_cost_cents: item.actual_cost_cents,
      paid_cents: item.paid_cents,
      note: item.note,
      payment_count: item.payments.length,
      account_vendor_uuid: item.account_vendor_uuid ?? null,
    }))
  );
  const summary = {
    budgeted_cents: budget.budgeted_cents,
    cost_cents: budget.cost_cents,
    paid_cents: budget.paid_cents,
    balance_due_cents: budget.balance_due_cents,
    items,
  };
  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function updateBudgetItem(args: {
  uuid: string;
  actual_cost_cents?: number;
  note?: string;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<Budget>>('GET', '/v3/budgets');
  const allItems = response.data.taxonomy_nodes.flatMap((node) => node.items);
  const current = allItems.find((item) => item.uuid === args.uuid);
  if (!current) {
    throw new Error(`Budget item with UUID "${args.uuid}" not found`);
  }
  const body = {
    item_uuid: args.uuid,
    taxonomy_node_uuid: current.taxonomy_node_uuid,
    estimated_cost_cents: current.estimated_cost_cents,
    actual_cost_cents: args.actual_cost_cents ?? current.actual_cost_cents,
    note: args.note ?? current.note,
    item_type: itemTypeKey(current.item_type),
    title: current.title,
    ...(current.account_vendor_uuid ? { account_vendor_uuid: current.account_vendor_uuid } : {}),
  };
  const result = await client.requestMobile<MobileEnvelope<BudgetItem>>('PUT', '/v3/budgets/items', body);
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

export function registerBudgetTools(server: McpServer): void {
  server.tool(
    'get_budget',
    'Get the wedding budget summary including total budgeted, actual cost, paid, and all budget items',
    {},
    getBudget
  );

  server.tool(
    'update_budget_item',
    "Update a budget item's actual cost and/or note by UUID",
    {
      uuid: z.string().describe('Budget item UUID from get_budget'),
      actual_cost_cents: z.number().optional().describe('Actual cost in cents'),
      note: z.string().optional().describe('Note for the budget item'),
    },
    updateBudgetItem
  );
}
