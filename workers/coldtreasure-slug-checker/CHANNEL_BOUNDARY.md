# Publishing Channel Boundary

## Authoritative identities

- ColdTreasure content uses a stable internal content identity across platforms.
- `coldtreasure.com` uses Website Slug as a Website Publishing Channel identity.
- A Website Slug must never become the shared identity for Instagram, YouTube, WeChat, Douyin, Dewu, or future channels.

## Current module scope

This module may own:

- Website slug validation and claims;
- Website slug ownership and history;
- Website redirect-source data;
- Website slug checks requested by the current Notion publishing workflow.

This module does not own:

- global content identity;
- non-Website platform identifiers or permalinks;
- global content publication state;
- Gallery asset identity;
- Distribution execution for other channels.

## Extension seam

Future channel adapters should bind stable content IDs to their own channel identity and Distribution records. Phase P0 creates no speculative channel tables, fields, Workers, or integrations.

