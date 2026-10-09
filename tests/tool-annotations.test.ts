// Invariant: every tool says what it is. The spec defaults `destructiveHint`
// to TRUE whenever `readOnlyHint` is not true, so a write that forgets to
// declare it is published as destructive and nothing fails — a considered
// `false` and a forgotten one would otherwise look identical. This reads the
// REGISTERED config off TOOL_REGISTRARS (the list src/index.ts serves), not a
// hand-kept list, so a new tool is covered the moment it is registered.
//
// The rule that decides destructive (fleet "inverse test"): `false` only when a
// later call in THIS tool set restores the prior state. The fleet lint
// (audit-annotations --strict) checks the same thing on the built server.
import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { client } from '../src/client.js';
import { TOOL_REGISTRARS } from '../src/tools/index.js';

interface Ann {
  readOnlyHint?: unknown;
  destructiveHint?: unknown;
  openWorldHint?: unknown;
}

function registeredAnnotations(): Record<string, Ann | undefined> {
  const seen: Record<string, Ann | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Ann }) => {
      seen[name] = cfg.annotations;
    },
  } as unknown as McpServer;
  for (const register of TOOL_REGISTRARS) register(server, client);
  return seen;
}

const isWrite = (a: Ann | undefined) => a?.readOnlyHint !== true;

describe('tool annotations', () => {
  const tools = registeredAnnotations();

  it('covers the full served surface (guards against a registrar going missing)', () => {
    expect(Object.keys(tools)).toHaveLength(77);
  });

  it('sets an explicit boolean destructiveHint on every write', () => {
    const undeclared = Object.entries(tools)
      .filter(([, a]) => isWrite(a) && typeof a?.destructiveHint !== 'boolean')
      .map(([name]) => name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', () => {
    const contradictory = Object.entries(tools)
      .filter(([, a]) => a?.readOnlyHint === true && a?.destructiveHint === true)
      .map(([name]) => name);
    expect(contradictory).toEqual([]);
  });

  it('declares every tool open-world (each one calls Zola)', () => {
    const notOpen = Object.entries(tools)
      .filter(([, a]) => a?.openWorldHint !== true)
      .map(([name]) => name);
    expect(notOpen).toEqual([]);
  });

  // Writes with no inverse in this tool set. Each would otherwise read as
  // "a write the owner can undo", which it is not.
  it.each([
    // No tool marks a conversation unread again.
    'mark_inquiry_read',
    // No tool unseats a guest, so a guest seated from list_unseated_guests
    // cannot be returned to unseated.
    'assign_seat',
    // No tool deletes a card project.
    'create_card_project',
  ])('%s is destructive (no inverse here)', (name) => {
    expect(tools[name]?.destructiveHint).toBe(true);
  });

  it('holds the destructive write set at its measured size', () => {
    // A tripwire: growing this set should be a decision, not a side effect.
    const destructive = Object.entries(tools)
      .filter(([, a]) => isWrite(a) && a?.destructiveHint === true)
      .map(([name]) => name)
      .sort();
    expect(destructive).toEqual([
      'assign_seat',
      'create_card_project',
      'mark_inquiry_read',
      'remove_event_invitation',
      'remove_faq',
      'remove_guest',
      'remove_home_section',
      'remove_poi',
      'remove_registry_item',
      'remove_travel_item',
      'remove_vendor',
      'set_event_guests',
      'update_event',
      'update_registry_item',
      'update_wedding_settings',
    ]);
  });
});
