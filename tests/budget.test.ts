import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { getBudget, listBudgetItemTypes, updateBudgetItem } from '../src/tools/budget.js';

const MOCK_BUDGET = {
  uuid: 'budget-uuid-1',
  account_id: 4664323,
  budgeted_cents: 3000000,
  actual_cost_cents: 2456900,
  paid_cents: 75000,
  balance_due_cents: 2381900,
  taxonomy_nodes: [
    {
      title: 'Essential vendors',
      items: [
        {
          uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
          taxonomy_node_uuid: 'node-uuid-1',
          title: 'Venue',
          cost_cents: 2456900,
          estimate: false,
          estimated_cost_cents: 441411,
          actual_cost_cents: 2456900,
          item_type: 'VENUE',
          vendor_type: 'VENUE',
          paid_cents: 75000,
          note: 'Original note',
          payments: [
            {
              uuid: 'payment-uuid-1',
              budget_item_uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
              payment_type: 'DEPOSIT',
              amount_cents: 75000,
              note: null,
              paid_at: 1743019200000,
              due_at: 1737676800000,
              remind_at: null,
            },
          ],
        },
      ],
    },
  ],
};

describe('budget tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'request'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'request');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getBudget: calls by-account and returns flat summary with items', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_BUDGET as never);

    const result = await getBudget();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/web-api/v1/budgets/by-account');
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.budgeted_cents).toBe(3000000);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].uuid).toBe('8b90d700-c891-46f9-87c5-f0f8b786b457');
    expect(parsed.items[0].title).toBe('Venue');
    expect(parsed.items[0].item_type).toBe('VENUE');
    expect(parsed.items[0].payment_count).toBe(1);
  });

  it('listBudgetItemTypes: calls items/types and returns simplified array', async () => {
    const mockTypes = [
      { budget_item_type: 'VENUE', display_name: 'Venue', vendor_type: 'VENUE', searchable_vendor_type: 'VENUE', display_order: 1 },
      { budget_item_type: 'PHOTOGRAPHER', display_name: 'Photographer', vendor_type: 'PHOTOGRAPHER', searchable_vendor_type: 'PHOTOGRAPHER', display_order: 2 },
    ];
    reqSpy.mockResolvedValueOnce(mockTypes as never);

    const result = await listBudgetItemTypes();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/web-api/v1/budgets/items/types');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].budget_item_type).toBe('VENUE');
    expect(parsed[0].display_order).toBe(1);
  });

  it('updateBudgetItem: GETs budget, merges fields, PUTs correct body', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_BUDGET as never)
      .mockResolvedValueOnce(undefined as never);

    const result = await updateBudgetItem({
      uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
      actual_cost_cents: 2600000,
      note: 'Updated note',
    });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'GET', '/web-api/v1/budgets/by-account');
    expect(reqSpy).toHaveBeenNthCalledWith(2, 'PUT', '/web-api/v1/budgets/items/update', {
      uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
      actual_cost_cents: 2600000,
      note: 'Updated note',
      payments: [],
    });
    expect(result.content[0].text).toContain('Venue');
    expect(result.content[0].text).toContain('actual_cost_cents=2600000');
  });

  it('updateBudgetItem: throws descriptive error when uuid not found', async () => {
    const emptyBudget = { ...MOCK_BUDGET, taxonomy_nodes: [] };
    reqSpy.mockResolvedValueOnce(emptyBudget as never);

    await expect(
      updateBudgetItem({ uuid: 'nonexistent-uuid' })
    ).rejects.toThrow('Budget item with UUID "nonexistent-uuid" not found');
  });
});
