# Changelog

## [1.12.0](https://github.com/chrischall/zola-mcp/compare/v1.11.0...v1.12.0) (2026-09-04)


### Features

* **tools:** minify every response — no formatting whitespace on any payload ([#201](https://github.com/chrischall/zola-mcp/issues/201)) ([6b9dae1](https://github.com/chrischall/zola-mcp/commit/6b9dae1d06d0b97fd2cf1a49909984ee6121ac9e))


### Refactor

* **tools:** drop the unused src/view.ts scaffolding ([#204](https://github.com/chrischall/zola-mcp/issues/204)) ([49d3200](https://github.com/chrischall/zola-mcp/commit/49d32006303f32547ead7ae6cd0260f2cb007a9c))


### Documentation

* point projectRegistryItem at src/registry-collection.ts ([#206](https://github.com/chrischall/zola-mcp/issues/206)) ([2123d18](https://github.com/chrischall/zola-mcp/commit/2123d1882ee10be0f340ef47ae29da9ba78add85))

## [1.11.0](https://github.com/chrischall/zola-mcp/compare/v1.10.0...v1.11.0) (2026-08-30)


### Features

* add zola_healthcheck ([#188](https://github.com/chrischall/zola-mcp/issues/188)) ([d8e1265](https://github.com/chrischall/zola-mcp/commit/d8e1265dd1aa33b6824fa3eed046032e5b9aceab)), closes [#189](https://github.com/chrischall/zola-mcp/issues/189)

## [1.10.0](https://github.com/chrischall/zola-mcp/compare/v1.9.0...v1.10.0) (2026-08-29)


### Features

* **auth:** cache the bootstrapped refresh token so hosted cold starts need no browser ([#183](https://github.com/chrischall/zola-mcp/issues/183)) ([3a56ad5](https://github.com/chrischall/zola-mcp/commit/3a56ad528d734d2c6b520ced4af1515198909200))

## [1.9.0](https://github.com/chrischall/zola-mcp/compare/v1.8.1...v1.9.0) (2026-08-29)


### Features

* **deps:** take @fetchproxy/server 2.2.0 so the concentrator can bind its sandbox address ([#181](https://github.com/chrischall/zola-mcp/issues/181)) ([dfe2a60](https://github.com/chrischall/zola-mcp/commit/dfe2a60e329af00c5539d77162b3bfda865a45ad))

## [1.8.1](https://github.com/chrischall/zola-mcp/compare/v1.8.0...v1.8.1) (2026-08-28)


### Bug Fixes

* **egress:** declare only the hosts the server process dials in mint.yaml ([#179](https://github.com/chrischall/zola-mcp/issues/179)) ([b6a4098](https://github.com/chrischall/zola-mcp/commit/b6a40986fc9e68bf880303b344d68503f70180e1))

## [1.8.0](https://github.com/chrischall/zola-mcp/compare/v1.7.5...v1.8.0) (2026-08-26)


### Features

* **release:** publish zola-api alongside zola ([#177](https://github.com/chrischall/zola-mcp/issues/177)) ([2be795b](https://github.com/chrischall/zola-mcp/commit/2be795b0b030f26e374e29604e95dfa1bbb05ef8))


### Bug Fixes

* match the manifest inventory's own formatting for mint.yaml ([#173](https://github.com/chrischall/zola-mcp/issues/173)) ([ca1712b](https://github.com/chrischall/zola-mcp/commit/ca1712b67894e8c450de75d19aba451e8f9e82a1))

## [1.7.5](https://github.com/chrischall/zola-mcp/compare/v1.7.4...v1.7.5) (2026-08-07)


### Bug Fixes

* **connector:** finish the retirement sweep ([#158](https://github.com/chrischall/zola-mcp/issues/158)) ([1ee3bc3](https://github.com/chrischall/zola-mcp/commit/1ee3bc38ab22ad691ca3a29c78f0bd422b190a29))


### Refactor

* **connector:** retire the standalone Cloudflare Worker connector ([#155](https://github.com/chrischall/zola-mcp/issues/155)) ([647a18a](https://github.com/chrischall/zola-mcp/commit/647a18a3c246200d2b972fbbf14fc1299c2bdb79))

## [1.7.4](https://github.com/chrischall/zola-mcp/compare/v1.7.3...v1.7.4) (2026-08-06)


### Bug Fixes

* **deps:** move to @fetchproxy/server 2.0.0 for the v3 handshake ([#153](https://github.com/chrischall/zola-mcp/issues/153)) ([4fd9625](https://github.com/chrischall/zola-mcp/commit/4fd9625f18c9034c5fd098f5fbaaacd672ee83ae))

## [1.7.3](https://github.com/chrischall/zola-mcp/compare/v1.7.2...v1.7.3) (2026-08-01)


### Bug Fixes

* **registry:** retry the intermittent 403 and measure cash funds against their goal ([#144](https://github.com/chrischall/zola-mcp/issues/144)) ([016a557](https://github.com/chrischall/zola-mcp/commit/016a557e007623c1f2f9da45e3701ae3bef104a8))

## [1.7.2](https://github.com/chrischall/zola-mcp/compare/v1.7.1...v1.7.2) (2026-08-01)


### Documentation

* fix the skill tool count and document reconcile_registry in the manifest ([#142](https://github.com/chrischall/zola-mcp/issues/142)) ([3cf1de3](https://github.com/chrischall/zola-mcp/commit/3cf1de3e70e7dcd41805f8384e898c7d35b21eb6))

## [1.7.1](https://github.com/chrischall/zola-mcp/compare/v1.7.0...v1.7.1) (2026-08-01)


### Bug Fixes

* **registry:** assert reconcile reads the whole registry, and document the new tools ([#139](https://github.com/chrischall/zola-mcp/issues/139)) ([0d7d173](https://github.com/chrischall/zola-mcp/commit/0d7d173adfde24e9bad600dc43eb4a9d3c95afb1))

## [1.7.0](https://github.com/chrischall/zola-mcp/compare/v1.6.6...v1.7.0) (2026-08-01)


### Features

* **registry:** make registry reads work and expose per-item purchase state ([#135](https://github.com/chrischall/zola-mcp/issues/135)) ([81929dd](https://github.com/chrischall/zola-mcp/commit/81929ddb9fccdf68c45ca5770d9dc87accf34e74))

## [1.6.6](https://github.com/chrischall/zola-mcp/compare/v1.6.5...v1.6.6) (2026-07-30)


### Bug Fixes

* **deps:** bump @fetchproxy/* to 1.7.0 and @chrischall/mcp-utils to 0.14.0 ([#133](https://github.com/chrischall/zola-mcp/issues/133)) ([bc5232f](https://github.com/chrischall/zola-mcp/commit/bc5232f33a28c9b65a875fd1c86191ec4b6a4afc))

## [1.6.5](https://github.com/chrischall/zola-mcp/compare/v1.6.4...v1.6.5) (2026-07-27)


### Documentation

* restore the squash-merge-only fact dropped by the pointer rewrite ([#131](https://github.com/chrischall/zola-mcp/issues/131)) ([055952c](https://github.com/chrischall/zola-mcp/commit/055952cccf9d6d37dd04cf7b8de7b33bde4e243e))

## [1.6.4](https://github.com/chrischall/zola-mcp/compare/v1.6.3...v1.6.4) (2026-07-27)


### Bug Fixes

* **deps:** require @chrischall/mcp-connector &gt;=1.1.1 ([#126](https://github.com/chrischall/zola-mcp/issues/126)) ([f40652b](https://github.com/chrischall/zola-mcp/commit/f40652b011443a9d5e1a10a5d675aa941fc86f22))

## [1.6.3](https://github.com/chrischall/zola-mcp/compare/v1.6.2...v1.6.3) (2026-07-20)


### Bug Fixes

* **release:** publish again by disambiguating the skill path ([#117](https://github.com/chrischall/zola-mcp/issues/117)) ([9350a7f](https://github.com/chrischall/zola-mcp/commit/9350a7f826272a2020f650062c424dc90cf53464))

## [1.6.2](https://github.com/chrischall/zola-mcp/compare/v1.6.1...v1.6.2) (2026-07-19)


### Bug Fixes

* **deps:** move to workers-oauth-provider 0.8.x and mcp-connector 1.0.0 ([#111](https://github.com/chrischall/zola-mcp/issues/111)) ([d78e10f](https://github.com/chrischall/zola-mcp/commit/d78e10fe32a075de3b5b0907a8f13916593287bc))

## [1.6.1](https://github.com/chrischall/zola-mcp/compare/v1.6.0...v1.6.1) (2026-07-19)


### Bug Fixes

* **ci:** run the Workers test pool in CI ([#110](https://github.com/chrischall/zola-mcp/issues/110)) ([5d604fd](https://github.com/chrischall/zola-mcp/commit/5d604fd9e89e53d9a33a1a65da1cde7e9440af8e))


### Documentation

* replace duplicated fleet policy with a pointer ([#107](https://github.com/chrischall/zola-mcp/issues/107)) ([8c1bf8d](https://github.com/chrischall/zola-mcp/commit/8c1bf8de239534b3901a365a34aaf9986cc7e907))

## [1.6.0](https://github.com/chrischall/zola-mcp/compare/v1.5.0...v1.6.0) (2026-07-14)


### Features

* add hosted Cloudflare Worker connector ([#105](https://github.com/chrischall/zola-mcp/issues/105)) ([4fa00f6](https://github.com/chrischall/zola-mcp/commit/4fa00f6b2ea0ae45551d4da3b61de22010c6d0e9))

## [1.5.0](https://github.com/chrischall/zola-mcp/compare/v1.4.4...v1.5.0) (2026-07-13)


### Features

* **skill:** add zola api access skill ([#100](https://github.com/chrischall/zola-mcp/issues/100)) ([beb339d](https://github.com/chrischall/zola-mcp/commit/beb339dddc5998bd884403cabeef3d8238edb8da))


### Refactor

* **skill:** move root SKILL.md into skills/, point plugin.json at ./skills/ ([#103](https://github.com/chrischall/zola-mcp/issues/103)) ([5e586cb](https://github.com/chrischall/zola-mcp/commit/5e586cbc192768394199d1228701117df8d60c2c))


### Documentation

* document $WEDDING_ID in mobile-api-endpoints reference ([#104](https://github.com/chrischall/zola-mcp/issues/104)) ([764545b](https://github.com/chrischall/zola-mcp/commit/764545b9cdb9ddd33e260d5ab867fb86eda89b57))

## [1.4.4](https://github.com/chrischall/zola-mcp/compare/v1.4.3...v1.4.4) (2026-07-07)


### Bug Fixes

* bump @chrischall/mcp-utils to 0.12.0 ([#95](https://github.com/chrischall/zola-mcp/issues/95)) ([2eb1f39](https://github.com/chrischall/zola-mcp/commit/2eb1f39eff926a40543cd8242693e47c93cfd3a0))

## [1.4.3](https://github.com/chrischall/zola-mcp/compare/v1.4.2...v1.4.3) (2026-07-05)


### Documentation

* audit CLAUDE.md and add auto-review follow-up convention ([#82](https://github.com/chrischall/zola-mcp/issues/82)) ([f519bdb](https://github.com/chrischall/zola-mcp/commit/f519bdba33fa2ea68b00ee25f6c2e50baa883c14))
* bump pr-workflow marker to v2 ([#78](https://github.com/chrischall/zola-mcp/issues/78)) ([071fd0a](https://github.com/chrischall/zola-mcp/commit/071fd0aa65568a32ded904038f42f6765bedca14))
* fix .env.example to reference real auth flow, not nonexistent `npm run auth` ([#83](https://github.com/chrischall/zola-mcp/issues/83)) ([c4b1e38](https://github.com/chrischall/zola-mcp/commit/c4b1e38d2e38e60d036c765f89a4530a2221e22e))

## [1.4.2](https://github.com/chrischall/zola-mcp/compare/v1.4.1...v1.4.2) (2026-06-12)


### Bug Fixes

* bot PRs bypass the CI gate unconditionally (upstream curtaincall[#86](https://github.com/chrischall/zola-mcp/issues/86) review) ([#73](https://github.com/chrischall/zola-mcp/issues/73)) ([2d8f807](https://github.com/chrischall/zola-mcp/commit/2d8f8079e06ffd8d49072596efb8a75581f7b6fc))


### Documentation

* add MIT LICENSE file and README badges ([#70](https://github.com/chrischall/zola-mcp/issues/70)) ([608ebf7](https://github.com/chrischall/zola-mcp/commit/608ebf7e602cc4b0788b8e01244efe9196be69a4))
* cross-repo reusable review canary test ([#76](https://github.com/chrischall/zola-mcp/issues/76)) ([afd673a](https://github.com/chrischall/zola-mcp/commit/afd673a0a2eab6f3d8eecba64c36975704ec909a))

## [1.4.1](https://github.com/chrischall/zola-mcp/compare/v1.4.0...v1.4.1) (2026-06-09)


### Bug Fixes

* redact upstream body in session-refresh failure message ([#67](https://github.com/chrischall/zola-mcp/issues/67)) ([75036f4](https://github.com/chrischall/zola-mcp/commit/75036f4438d62f71019051efa0312651904cba65))


### Refactor

* adopt createAuthResolver and buildOptionalBody from mcp-utils 0.7.0 ([#69](https://github.com/chrischall/zola-mcp/issues/69)) ([dc2e445](https://github.com/chrischall/zola-mcp/commit/dc2e445d398e139efc2f7b4699ea9fced45dfce4))

## [1.4.0](https://github.com/chrischall/zola-mcp/compare/v1.3.2...v1.4.0) (2026-06-06)


### Features

* event-invitation assignment — `set_event_guests`, `invite_guest_to_event`, `remove_event_invitation` to control which guests are invited to which events; verified mobile-api `bulk/directory` read-modify-write that preserves other events' invitations and leaves RSVP untouched ([#60](https://github.com/chrischall/zola-mcp/pull/60))


### Bug Fixes

* `update_guest_address` no longer wipes a group's event invitations (it used a stale nested guest shape and blanked `event_invitations`; now uses the live flat shape + read-modify-write) ([#60](https://github.com/chrischall/zola-mcp/pull/60))


### Documentation

* correct release workflow (release-please, not Tag & Bump) ([#62](https://github.com/chrischall/zola-mcp/issues/62)) ([9625343](https://github.com/chrischall/zola-mcp/commit/96253430234fd6f7c6e3f8eb54e4de22c7948134))


### Dependencies

* bump `@chrischall/mcp-utils` → ^0.5.2, `@fetchproxy/{server,bootstrap}` → ^1.3.0, `vitest`/`@vitest/coverage-v8` → ^4.1.8, `@types/node` → ^25.9.2; declare `zod` ^4.4.3 as a direct dep; `npm audit` clean ([#60](https://github.com/chrischall/zola-mcp/pull/60))

## [1.3.2](https://github.com/chrischall/zola-mcp/compare/v1.3.1...v1.3.2) (2026-06-04)


### Bug Fixes

* adopt @fetchproxy/server 0.13.0 (bridge host failover + re-pairing) ([#57](https://github.com/chrischall/zola-mcp/issues/57)) ([57f19c5](https://github.com/chrischall/zola-mcp/commit/57f19c5a6bcede3eee9bc9df887dbdb823d9dd40))
* adopt @fetchproxy/server 1.0.0 + @chrischall/mcp-utils 0.5.0 ([#59](https://github.com/chrischall/zola-mcp/issues/59)) ([3227dbc](https://github.com/chrischall/zola-mcp/commit/3227dbc4daf7506443a5d52ab56ab9351d1c0b42))

## [1.3.1](https://github.com/chrischall/zola-mcp/compare/v1.3.0...v1.3.1) (2026-05-29)


### Bug Fixes

* **ci:** auto-merge arm guards ([#44](https://github.com/chrischall/zola-mcp/issues/44)) ([804097d](https://github.com/chrischall/zola-mcp/commit/804097d4f21ef40bc02999789b93bda80caaea7d))

## [1.3.0](https://github.com/chrischall/zola-mcp/compare/v1.2.3...v1.3.0) (2026-05-28)


### Features

* **deps:** bump @fetchproxy/bootstrap to 0.8.0 + surface SW-eviction hint ([#41](https://github.com/chrischall/zola-mcp/issues/41)) ([c9ad8a4](https://github.com/chrischall/zola-mcp/commit/c9ad8a4488ffd7ffede99d2a501cb10ab3a2d1ee))

## [1.2.3](https://github.com/chrischall/zola-mcp/compare/v1.2.2...v1.2.3) (2026-05-26)


### Bug Fixes

* **ci:** substitute repo name in publish workflow ([#37](https://github.com/chrischall/zola-mcp/issues/37)) ([adea018](https://github.com/chrischall/zola-mcp/commit/adea01884293488b9a0c1e2559fcd4739d9f1084))

## [1.2.2](https://github.com/chrischall/zola-mcp/compare/v1.2.1...v1.2.2) (2026-05-26)


### Documentation

* **claude:** warn against early PRs and call out first-party dep bumps ([#35](https://github.com/chrischall/zola-mcp/issues/35)) ([f112b12](https://github.com/chrischall/zola-mcp/commit/f112b12f781705d0e031a8cea5b4c21153ab775b))

## [1.2.1](https://github.com/chrischall/zola-mcp/compare/v1.2.0...v1.2.1) (2026-05-25)


### Bug Fixes

* **ci:** prevent labeled event from cancelling auto-review ([#32](https://github.com/chrischall/zola-mcp/issues/32)) ([28b9916](https://github.com/chrischall/zola-mcp/commit/28b99166263d150bb834a2dbca37d0d5cb06d706))

## [1.2.0](https://github.com/chrischall/zola-mcp/compare/v1.1.4...v1.2.0) (2026-05-24)


### Features

* add budget.ts with get_budget, list_budget_item_types, update_budget_item and tests ([6046fe5](https://github.com/chrischall/zola-mcp/commit/6046fe5e83ed5a9cbc1ef0a37a6b013280169aac))
* add client.getContext() to dynamically resolve account/registry IDs ([eb4a3fd](https://github.com/chrischall/zola-mcp/commit/eb4a3fdd29192247806144ddb1c9ca9076f15300))
* add events, RSVPs, gift tracker, and registry tools ([b6ab134](https://github.com/chrischall/zola-mcp/commit/b6ab134b65aa9a8160603820acbc50d628f614d8))
* add guests.ts with list_guests, add_guest, update_guest_address, remove_guest and tests ([f1fd2c4](https://github.com/chrischall/zola-mcp/commit/f1fd2c42f5ab6ed3957d58be1f080496c993a4e4))
* add inquiry tools (list_inquiries, get_inquiry_conversation, mark_inquiry_read) ([d80a272](https://github.com/chrischall/zola-mcp/commit/d80a272c8cc2404f94f7aee961f2f6c52f230330))
* add readOnlyHint/destructiveHint annotations to all 27 tools ([3fba33a](https://github.com/chrischall/zola-mcp/commit/3fba33a59418439e9b9d18ef93fe648111dd15ea))
* add requestMarketplace() to ZolaClient for marketplace API ([227db76](https://github.com/chrischall/zola-mcp/commit/227db76b70b97eda0f7d89d85a9a27d39fc63d90))
* add requestMobile() to ZolaClient for mobile-api.zola.com ([037c8dc](https://github.com/chrischall/zola-mcp/commit/037c8dc2bb048a404cb72cea06408240ed1d9ae2))
* add seating tools (list_seating_charts, get_seating_chart, list_unseated_guests, assign_seat) ([958412a](https://github.com/chrischall/zola-mcp/commit/958412a2f830d0071899497957014b62e58c4c14))
* add seating tools (list_seating_charts, get_seating_chart, list_unseated_guests, assign_seat) ([42d8db7](https://github.com/chrischall/zola-mcp/commit/42d8db7d9f645f8b14fdaf189bc0f1a7f37e33c4))
* add setup-auth.sh script for one-time token capture via mitmproxy ([79be4b5](https://github.com/chrischall/zola-mcp/commit/79be4b5bbe96e37fda61504599e4aa1b8e63ae9f))
* add update_event tool (captured PUT /v3/websites/events/{id}) ([062cff6](https://github.com/chrischall/zola-mcp/commit/062cff6bbac2c208e8520642916bc669f30ca5bd))
* add wedding dashboard, vendor search, storefront details, and favorites tools ([dda9930](https://github.com/chrischall/zola-mcp/commit/dda9930e78d272ad8293e517616912553086cdd7))
* add_vendor tool ([3ac4fe6](https://github.com/chrischall/zola-mcp/commit/3ac4fe6125e3650c6c92208b8c5d852c8586d10d))
* address phase 2 post-merge review notes ([45a0ea1](https://github.com/chrischall/zola-mcp/commit/45a0ea16b14d9e5d301999a76b8a7f5ccb4adcab))
* **client:** expose wedding_id in UserContext ([61419b5](https://github.com/chrischall/zola-mcp/commit/61419b5a657320ec645664eb9b72f554ce396dcc))
* defend website customization updates against Zola partial-update wipe ([c96d010](https://github.com/chrischall/zola-mcp/commit/c96d0105c05188d3eb89a7ea47037ad1486f7839))
* **deploy:** registry listings for MCP Registry, Claude plugins, ClawHub, PulseMCP, mcpservers.org ([96f89a6](https://github.com/chrischall/zola-mcp/commit/96f89a6ccf75080c7efe3fd55de0dcffa7c140e0))
* implement correct CSRF double-submit pattern for POST/PUT/DELETE requests ([9ed3f97](https://github.com/chrischall/zola-mcp/commit/9ed3f9754a9997edbe59e72e2ea9b354d0526c87))
* list_vendors and search_vendors tools ([998e0d7](https://github.com/chrischall/zola-mcp/commit/998e0d7e6712ec1976aef40c4973695f74fad636))
* MCP server entrypoint ([e742118](https://github.com/chrischall/zola-mcp/commit/e742118f565bffd0e67e0d90a0856df11225d8cd))
* migrate budget tools from web API to mobile API (fixes update_budget_item 500 error) ([615c1a2](https://github.com/chrischall/zola-mcp/commit/615c1a299b8ab6288bf2ab057ed6c2f2d2146914))
* migrate guests to mobile API, remove web API entirely ([b0f9260](https://github.com/chrischall/zola-mcp/commit/b0f92603f41863eb11e907f96db4d5560ad469dc))
* migrate vendors from web marketplace API to mobile API ([737d26c](https://github.com/chrischall/zola-mcp/commit/737d26c30f462363eae3f8a95c8b922237485308))
* optional @fetchproxy/bootstrap fallback for auth ([b50319b](https://github.com/chrischall/zola-mcp/commit/b50319b08c627a501647915ba4a7cf3a19b0044c))
* optional @fetchproxy/bootstrap fallback for auth ([5959b3e](https://github.com/chrischall/zola-mcp/commit/5959b3e3cd925612ca49cbcc4b9ed47c1aba0f1e))
* register phase 2 website tools in MCP server ([c080f57](https://github.com/chrischall/zola-mcp/commit/c080f57da673282a086a2c67cebbb318822470e2))
* register website content tools in MCP server ([cbf69c5](https://github.com/chrischall/zola-mcp/commit/cbf69c5788ae5566a832d97161cf73bb2eaf4ef4))
* register website tools in MCP server ([e7aaad7](https://github.com/chrischall/zola-mcp/commit/e7aaad7e4da8112a0beb8e112a7b3a3a79bd4faf))
* **registry:** add registry item CRUD and product search tools ([1759156](https://github.com/chrischall/zola-mcp/commit/1759156249373e46eaa5ac3a1612cf4c59651624))
* rename all tools with zola_ prefix for namespace clarity ([b8a479f](https://github.com/chrischall/zola-mcp/commit/b8a479f99556a309a7bb6115c82a0ee88031c3a1))
* replace mitmproxy/iOS auth with browser-based capture ([d29c613](https://github.com/chrischall/zola-mcp/commit/d29c613c4483501d8aa2cea7035988f3d56bbd8d))
* unify auth via mobile API refresh endpoint ([9b0d7af](https://github.com/chrischall/zola-mcp/commit/9b0d7af11e0cdf56c01673fa3cf92b03370af121))
* update_vendor and remove_vendor tools ([d695a2a](https://github.com/chrischall/zola-mcp/commit/d695a2ae828c99db7979639905a763300f11a77f))
* **website:** add FAQ CRUD tools with cached page-id lookup ([2ab0352](https://github.com/chrischall/zola-mcp/commit/2ab035245ae0544dc4f3b5db33b79d7d836cff8f))
* **website:** add get_wedding_settings and update_wedding_settings ([3201533](https://github.com/chrischall/zola-mcp/commit/32015338ff8a91855d6277dc9011473aeaa1b2e3))
* **website:** add home section CRUD tools ([5dba242](https://github.com/chrischall/zola-mcp/commit/5dba2422e45e9c94575c8c7b307be8e3da7caf57))
* **website:** add list_pages tool ([ceacc88](https://github.com/chrischall/zola-mcp/commit/ceacc883424b5f13bd38a5d24788385156cf7167))
* **website:** add POI CRUD tools for Things-to-Do page ([6562db3](https://github.com/chrischall/zola-mcp/commit/6562db34b75b78caf3bafb9e75356666db8ff057))
* **website:** add set_page_hidden and reorder_pages tools ([c27e5ca](https://github.com/chrischall/zola-mcp/commit/c27e5ca378653e08f73611bfea126b46b7e16d14))
* **website:** add theme and design customization tools ([beaf63f](https://github.com/chrischall/zola-mcp/commit/beaf63f1f6aa3b297c5bb863dce611dcfe86c2e9))
* **website:** add travel item CRUD tools ([5e161d1](https://github.com/chrischall/zola-mcp/commit/5e161d1cd88c27fd38d6127ceb43c2e84632e339))
* **website:** add update_page tool ([9ef52ea](https://github.com/chrischall/zola-mcp/commit/9ef52ea5d37ab38a73afac2df1647566322540c8))
* **website:** extend PageType union to include TRAVEL ([14d9bac](https://github.com/chrischall/zola-mcp/commit/14d9bac270253b92a4c1bf81bd7d0ec8a284c899))
* wire registerBudgetTools into index.ts ([77fbaef](https://github.com/chrischall/zola-mcp/commit/77fbaef0f79016da26bb7176b4cbbc7bc54f8163))
* wire registerGuestTools into index.ts ([5c65d79](https://github.com/chrischall/zola-mcp/commit/5c65d793a1f6b0ffc8e8efebc50960476073f1b5))
* wire registerInquiryTools into MCP server ([583a004](https://github.com/chrischall/zola-mcp/commit/583a004dd8bd0a4229b309beb2f25d50b84548ba))
* wire registerSeatingTools into MCP server ([05a9501](https://github.com/chrischall/zola-mcp/commit/05a9501c732e88d5981abe1ce86743b3cc86ba1f))
* wire vendor tools into MCP server ([cbc491d](https://github.com/chrischall/zola-mcp/commit/cbc491d895e86a9fbbca371d8fc0229dcc5ce147))
* ZolaClient with cookie-based auth and best-effort session refresh ([e9cac40](https://github.com/chrischall/zola-mcp/commit/e9cac4007fb5adaf1b916ed969278c837fa6e160))


### Bug Fixes

* add user-agent header to WAF bypass, migrate to registerTool ([0b9cbba](https://github.com/chrischall/zola-mcp/commit/0b9cbba168cb0fec5444e25b8066e1b1a50e7739))
* add x-zola-session-id header required by CloudFront WAF ([7f31188](https://github.com/chrischall/zola-mcp/commit/7f311880c0dec658a6694d98a92d62287d106e9b))
* address phase 2 pre-merge review notes ([42d671c](https://github.com/chrischall/zola-mcp/commit/42d671c2e60949736784318202daaf41c82c89f1))
* align doMobileRequest with doRequest patterns (null return, error format, JWT guard) ([f47ca0d](https://github.com/chrischall/zola-mcp/commit/f47ca0d724f3d7f9fed2420d2f98e268a1c5c540))
* align manifest env reference with user_config key ([9467250](https://github.com/chrischall/zola-mcp/commit/946725088f3a4e6072af4de53a8d4e02003d1f7a))
* **bundle:** add createRequire shim so ws works in ESM bundle ([5a3f5f2](https://github.com/chrischall/zola-mcp/commit/5a3f5f2928ab84b1724f2a5e1cdf5254a619b18f))
* **bundle:** add createRequire shim so ws works in ESM bundle ([29563d9](https://github.com/chrischall/zola-mcp/commit/29563d972b545ff3eaa29ac500a15811da446ab0))
* clarify list_vendors description; test eventDate conversion in addVendor ([81967ea](https://github.com/chrischall/zola-mcp/commit/81967ea95451cc6a4706104010bb0e19b6319117))
* clarify payments intent and include note in update confirmation message ([c2c2bf2](https://github.com/chrischall/zola-mcp/commit/c2c2bf2c1254b4116c1d199a4349e7cab8cb99a2))
* **client:** silence dotenv v17 stdout banner (breaks JSON-RPC over stdio) ([8e65582](https://github.com/chrischall/zola-mcp/commit/8e65582f194e37fd7cf3243f153ad9f75859089b))
* **deploy:** shorten server.json description to ≤100 chars for MCP Registry ([470839a](https://github.com/chrischall/zola-mcp/commit/470839a72fd6e864ec1d98a20ea2c828a6cc08de))
* document CHILD relationship_type as Zola API term for non-primary household member ([403ddb3](https://github.com/chrischall/zola-mcp/commit/403ddb308ae4815cf189a90571d11bcb0a8ba004))
* **env:** also reject literal "undefined"/"null" in readVar ([60e4249](https://github.com/chrischall/zola-mcp/commit/60e4249fe5d12484dd0953401f9446b03892a6ab))
* **env:** treat blank/whitespace/placeholder env vars as unset ([9c48c98](https://github.com/chrischall/zola-mcp/commit/9c48c9896e14b6039771c7f2e6f54970d1247107))
* inquiry API field renamed from 'inquiries' to 'inquiry_summaries' ([ef2be89](https://github.com/chrischall/zola-mcp/commit/ef2be8956308eed1d1e817ae8359441c1a5c832c))
* restore refactor changes that were lost during the main merge ([f2d1b77](https://github.com/chrischall/zola-mcp/commit/f2d1b779d6b07f0846dfb9c22dd25d18e0e41546))
* restore server name to 'zola-mcp' ([58e11f3](https://github.com/chrischall/zola-mcp/commit/58e11f3ce592cf805f72d903e46a039139ef6988))
* revert tool prefix, change MCP server name to 'Zola' ([907888a](https://github.com/chrischall/zola-mcp/commit/907888a1f90b4a933d052dd002e22a6a71a0c798))
* separate auth/rate retry flags; document Node &gt;=20.6.0 requirement ([b661eaa](https://github.com/chrischall/zola-mcp/commit/b661eaad45dbce77c7bf8b0136c9e165114d7eaf))
* strengthen decodeJwtExp validation and document parseCookies fallback ([38b9c65](https://github.com/chrischall/zola-mcp/commit/38b9c6559655111b721bc927acce47e7e2c5b114))
* **website:** populate page-id cache for all 3 types in one fetch ([4afbe0d](https://github.com/chrischall/zola-mcp/commit/4afbe0da24f183bbdf586df97566233c12dc4d1a))


### Refactor

* complete mobile API migration, code cleanup, shared types ([8218bfe](https://github.com/chrischall/zola-mcp/commit/8218bfe0b80279a9a89c4722c2e75bfe5aa2e18d))
* consolidate remove-entity logic into shared helper ([dfab7d3](https://github.com/chrischall/zola-mcp/commit/dfab7d3426680c3f5201ccf8f4289be18416f126))
* extract shared MOCK_CTX and setupClientMocks to tests/_fixtures.ts ([69021a4](https://github.com/chrischall/zola-mcp/commit/69021a48ee79652939e068c37dd049095249ffa0))
* extract shared tool types and jsonResult/pickDefined helpers ([0b8f6e2](https://github.com/chrischall/zola-mcp/commit/0b8f6e2b9955e945937404c302a2e238ca4ec8ff))


### Documentation

* add Acknowledgement of Terms section to README ([#26](https://github.com/chrischall/zola-mcp/issues/26)) ([6ea33ee](https://github.com/chrischall/zola-mcp/commit/6ea33ee5b1cae95b34c247bdfe00760390117708))
* add capture plan for write endpoints (vendors, guests, events, registry, inquiry reply) ([680ea48](https://github.com/chrischall/zola-mcp/commit/680ea48ff187927013949b4bfbbc2067f905acb8))
* add implementation plans and lockfile ([f5613e1](https://github.com/chrischall/zola-mcp/commit/f5613e1e07b7b9fe685d3755f5baf496f3116010))
* add MCPB and npm install options to README ([efd6b64](https://github.com/chrischall/zola-mcp/commit/efd6b6466466df7e955f448afc8dd43d33b81862))
* add MCPB build and release instructions to README ([51f4f70](https://github.com/chrischall/zola-mcp/commit/51f4f70545c430fac26989d1d52961a083218353))
* add mobile API catalog and inquiries design spec ([b432677](https://github.com/chrischall/zola-mcp/commit/b43267770a439d90dbbafd59557de9772c9ac5c6))
* add phase 2 implementation plan (travel, theme, registry items) ([f02258d](https://github.com/chrischall/zola-mcp/commit/f02258d589fc4c2f0a712aeaa0ff6f0385f46510))
* add website editing design ([c28e451](https://github.com/chrischall/zola-mcp/commit/c28e4517ac91398ad08ccfa13e5d1680eea0bc1c))
* add website editing implementation plan ([f203a39](https://github.com/chrischall/zola-mcp/commit/f203a393b05fc82522bcee740ede8fdb07fd51b2))
* canonical auto-merge guidance ([#27](https://github.com/chrischall/zola-mcp/issues/27)) ([6bbd829](https://github.com/chrischall/zola-mcp/commit/6bbd829eee169efca6a78ce60cd40b3a059f31b9))
* **claude-md:** call out 100-char limit on server.json description ([5d8a707](https://github.com/chrischall/zola-mcp/commit/5d8a70777fdce6bc8854ec01e87ca29bb70b1528))
* **claude-md:** call out 100-char limit on server.json description ([06022ed](https://github.com/chrischall/zola-mcp/commit/06022ed08402d000b8f74a70de490150f64ba6e3))
* **CLAUDE.md:** drop hardcoded fetchproxy 0.3.0 version refs ([60efb8a](https://github.com/chrischall/zola-mcp/commit/60efb8a8e580f7995dd743ade448a5addd5dba86))
* **CLAUDE.md:** drop hardcoded fetchproxy 0.3.0 version refs ([563db09](https://github.com/chrischall/zola-mcp/commit/563db093a5048772b3923b4ec8bb9a42c6939261))
* correct release-please PR handling in merge guidance ([#28](https://github.com/chrischall/zola-mcp/issues/28)) ([5640aaf](https://github.com/chrischall/zola-mcp/commit/5640aaf218008b23d6a52ade50af13bb0d7d7a19))
* ensure CLAUDE.md is current and complete ([85eaf1d](https://github.com/chrischall/zola-mcp/commit/85eaf1d06b4150a5164913a1bfe84d04e65e3767))
* ensure CLAUDE.md is current and complete ([d398a44](https://github.com/chrischall/zola-mcp/commit/d398a446a0a951625ca52f04075ec74887a7c55b))
* update missing-features after second capture session ([2d2f9e7](https://github.com/chrischall/zola-mcp/commit/2d2f9e735f24adf67adf1140af2669bde44eed58))
* vendors domain design spec ([75208d2](https://github.com/chrischall/zola-mcp/commit/75208d2a2ebaf76dd8b94c886e3b369beaaec0f6))
* vendors implementation plan ([680fc19](https://github.com/chrischall/zola-mcp/commit/680fc198c9200cb0ebe5ac556d6d5387789ff7e7))
