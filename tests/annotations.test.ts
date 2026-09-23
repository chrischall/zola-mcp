import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { client } from '../src/client.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerEventInvitationTools } from '../src/tools/event-invitations.js';
import { registerWebsiteTools } from '../src/tools/website.js';
import { registerRegistryItemTools } from '../src/tools/registry-items.js';

interface ToolConfig {
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
}

/** Capture each tool's registration config without starting a server. */
function collect(): Map<string, ToolConfig> {
  const tools = new Map<string, ToolConfig>();
  const server = {
    registerTool: (name: string, config: ToolConfig) => {
      tools.set(name, config);
    },
  } as unknown as McpServer;
  registerEventTools(server, client);
  registerEventInvitationTools(server, client);
  registerWebsiteTools(server, client);
  registerRegistryItemTools(server, client);
  return tools;
}

describe('write tools that remove or overwrite user data are marked destructive', () => {
  const tools = collect();

  // Clients use destructiveHint to decide whether to ask before running a
  // tool. Each of these discards data the user cannot get back:
  //  - removing an event invitation drops the guest's recorded RSVP;
  //  - set_event_guests with invited:false does the same, in bulk;
  //  - update_wedding_settings can change the public slug (breaking every
  //    printed invitation / QR URL) or search visibility;
  //  - update_registry_item is a full replace (personal note, fulfilled flag);
  //  - update_event is a full replace of the event.
  it.each([
    'remove_event_invitation',
    'set_event_guests',
    'update_wedding_settings',
    'update_registry_item',
    'update_event',
  ])('%s declares destructiveHint: true', (name) => {
    expect(tools.get(name)?.annotations?.destructiveHint).toBe(true);
  });

  it.each(['remove_event_invitation', 'set_event_guests'])(
    '%s warns that removing an invitation discards the RSVP',
    (name) => {
      expect(tools.get(name)?.description).toMatch(/RSVP/);
    }
  );

  it.each([
    'set_event_guests',
    'invite_guest_to_event',
    'remove_event_invitation',
    'update_wedding_settings',
    'update_registry_item',
    'update_event',
  ])('%s is an idempotent setter and says so', (name) => {
    expect(tools.get(name)?.annotations?.idempotentHint).toBe(true);
  });
});
