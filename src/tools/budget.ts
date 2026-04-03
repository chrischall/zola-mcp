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
  item_type: string;
  vendor_type: string;
  paid_cents: number;
  note: string | null;
  payments: BudgetPayment[];
}

interface TaxonomyNode {
  title: string;
  items: BudgetItem[];
}

interface Budget {
  uuid: string;
  account_id: number;
  budgeted_cents: number;
  actual_cost_cents: number;
  paid_cents: number;
  balance_due_cents: number;
  taxonomy_nodes: TaxonomyNode[];
}

interface BudgetItemType {
  budget_item_type: string;
  display_name: string;
  vendor_type: string;
  searchable_vendor_type: string;
  display_order: number;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

export async function getBudget(): Promise<ToolResult> {
  const budget = await client.request<Budget>('GET', '/web-api/v1/budgets/by-account');
  const items = budget.taxonomy_nodes.flatMap((node) =>
    node.items.map((item) => ({
      uuid: item.uuid,
      title: item.title,
      item_type: item.item_type,
      cost_cents: item.cost_cents,
      actual_cost_cents: item.actual_cost_cents,
      paid_cents: item.paid_cents,
      note: item.note,
      payment_count: item.payments.length,
    }))
  );
  const summary = {
    budgeted_cents: budget.budgeted_cents,
    actual_cost_cents: budget.actual_cost_cents,
    paid_cents: budget.paid_cents,
    balance_due_cents: budget.balance_due_cents,
    items,
  };
  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function listBudgetItemTypes(): Promise<ToolResult> {
  const types = await client.request<BudgetItemType[]>('GET', '/web-api/v1/budgets/items/types');
  const simplified = types.map((t) => ({
    budget_item_type: t.budget_item_type,
    display_name: t.display_name,
    vendor_type: t.vendor_type,
    display_order: t.display_order,
  }));
  return { content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }] };
}

export async function updateBudgetItem(args: {
  uuid: string;
  actual_cost_cents?: number;
  note?: string;
}): Promise<ToolResult> {
  const budget = await client.request<Budget>('GET', '/web-api/v1/budgets/by-account');
  const allItems = budget.taxonomy_nodes.flatMap((node) => node.items);
  const current = allItems.find((item) => item.uuid === args.uuid);
  if (!current) {
    throw new Error(`Budget item with UUID "${args.uuid}" not found`);
  }
  const body = {
    uuid: args.uuid,
    actual_cost_cents: args.actual_cost_cents ?? current.actual_cost_cents,
    note: args.note ?? current.note,
    payments: [] as BudgetPayment[],
  };
  await client.request<unknown>('PUT', '/web-api/v1/budgets/items/update', body);
  return {
    content: [
      {
        type: 'text',
        text: `Updated ${current.title}: actual_cost_cents=${body.actual_cost_cents}`,
      },
    ],
  };
}

export function registerBudgetTools(server: McpServer): void {
  server.tool(
    'get_budget',
    'Get the wedding budget summary including total budgeted, actual cost, paid, and all budget items',
    {},
    getBudget
  );

  server.tool(
    'list_budget_item_types',
    'List all available budget item types with display names',
    {},
    listBudgetItemTypes
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
