import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';
import { BRIEF_VIEW_NOTE, briefLine, briefResult, familyMeta, isoFromMillis } from './hints.js';

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

function itemTypeKey(item_type: string | { key: string }): string {
  return typeof item_type === 'string' ? item_type : item_type.key;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The brief view: one line per scheduled payment — `item payment $amount —
 * due date — paid|due` — because a payment, not a budget line, is what falls
 * due. Items with no payments scheduled have nothing due and are left out.
 */
export function budgetBriefLines(budget: Budget): string[] {
  return budget.taxonomy_nodes.flatMap((node) =>
    node.items.flatMap((item) =>
      (item.payments ?? []).map((p) =>
        briefLine(
          `${item.title} ${String(p.payment_type ?? 'payment').toLowerCase()} ${dollars(p.amount_cents ?? 0)}`,
          isoFromMillis(p.due_at, true),
          p.paid_at != null ? 'paid' : 'due',
        ),
      ),
    ),
  );
}

export async function getBudget(client: ZolaClient, args: { view?: 'full' | 'brief' } = {}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<Budget>>('GET', '/v3/budgets');
  const budget = response.data;
  if (args.view === 'brief') return briefResult(budgetBriefLines(budget));
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
  return jsonResult(summary);
}

export async function updateBudgetItem(client: ZolaClient, args: {
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
  return jsonResult(result.data);
}

export function registerBudgetTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('get_budget', {
    description: 'Get the wedding budget summary including total budgeted, actual cost, paid, and all budget items',
    inputSchema: z.object({
      view: z.enum(['full', 'brief']).optional().describe(`${BRIEF_VIEW_NOTE} One line per scheduled vendor payment; the date is when it is due, status is paid or due.`),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: familyMeta('whats-due', { canonical: true, aliases: ['wedding budget', 'payments', 'deposit', 'vendor payments', 'balance due', 'what do we owe'] }),
  }, (args) => getBudget(client, args));

  server.registerTool('update_budget_item', {
    description: "Update a budget item's actual cost and/or note by UUID",
    inputSchema: z.object({
      uuid: z.string().describe('Budget item UUID from get_budget'),
      actual_cost_cents: z.number().optional().describe('Actual cost in cents'),
      note: z.string().optional().describe('Note for the budget item'),
    }),
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: familyMeta('change'),
  }, (args) => updateBudgetItem(client, args));
}
