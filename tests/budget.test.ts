import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { getBudget, updateBudgetItem } from '../src/tools/budget.js';

const MOCK_BUDGET_ITEM = {
  uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
  taxonomy_node_uuid: 'node-uuid-1',
  title: 'Venue',
  cost_cents: 2456900,
  estimate: false,
  estimated_cost_cents: 441411,
  actual_cost_cents: 2456900,
  item_type: { key: 'VENUE', display_name: 'Venue' },
  paid_cents: 75000,
  note: 'Original note',
  account_vendor_uuid: 'vendor-uuid-1',
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
};

const MOCK_BUDGET_RESPONSE = {
  data: {
    uuid: 'budget-uuid-1',
    budgeted_cents: 3000000,
    cost_cents: 5015490,
    paid_cents: 75000,
    balance_due_cents: 2381900,
    taxonomy_nodes: [
      {
        title: 'Essential vendors',
        items: [MOCK_BUDGET_ITEM],
      },
    ],
  },
};

describe('budget tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getBudget: calls mobile API and returns flat summary with items', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_BUDGET_RESPONSE as never);

    const result = await getBudget();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/budgets');
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.budgeted_cents).toBe(3000000);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].uuid).toBe('8b90d700-c891-46f9-87c5-f0f8b786b457');
    expect(parsed.items[0].title).toBe('Venue');
    expect(parsed.items[0].item_type).toBe('VENUE');
    expect(parsed.items[0].payment_count).toBe(1);
    expect(parsed.items[0].taxonomy_node_uuid).toBe('node-uuid-1');
    expect(parsed.items[0].account_vendor_uuid).toBe('vendor-uuid-1');
  });

  it('updateBudgetItem: GETs budget via mobile, PUTs with correct body format', async () => {
    const updatedItem = { ...MOCK_BUDGET_ITEM, actual_cost_cents: 2600000, note: 'Updated note' };
    reqSpy
      .mockResolvedValueOnce(MOCK_BUDGET_RESPONSE as never)
      .mockResolvedValueOnce({ data: updatedItem } as never);

    const result = await updateBudgetItem({
      uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
      actual_cost_cents: 2600000,
      note: 'Updated note',
    });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'GET', '/v3/budgets');
    expect(reqSpy).toHaveBeenNthCalledWith(2, 'PUT', '/v3/budgets/items', {
      item_uuid: '8b90d700-c891-46f9-87c5-f0f8b786b457',
      taxonomy_node_uuid: 'node-uuid-1',
      estimated_cost_cents: 441411,
      actual_cost_cents: 2600000,
      note: 'Updated note',
      item_type: 'VENUE',
      title: 'Venue',
      account_vendor_uuid: 'vendor-uuid-1',
    });
    expect(result.content[0].text).toContain('Venue');
    expect(result.content[0].text).toContain('2600000');
  });

  it('updateBudgetItem: throws descriptive error when uuid not found', async () => {
    const emptyBudget = { data: { ...MOCK_BUDGET_RESPONSE.data, taxonomy_nodes: [] } };
    reqSpy.mockResolvedValueOnce(emptyBudget as never);

    await expect(
      updateBudgetItem({ uuid: 'nonexistent-uuid' })
    ).rejects.toThrow('Budget item with UUID "nonexistent-uuid" not found');
  });
});
