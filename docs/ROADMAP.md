# Pererecário — development roadmap

## Current baseline: visual kit v0.2

- 15 approved species and stable `frog_*` IDs.
- Atlas-based Flutter painter with album animations, silhouettes and accessibility settings.
- HTML preview demonstrating capture, difficulty and UI behavior without a real camera or database.

## Milestone 1 — Offline data first

- Define SQLite tables for player, species discovery, inventory specimens, encounters, pending operations and sync metadata.
- Persist one stable unique ID per encounter and per specimen; opening the same encounter twice must not create two items.
- Transactionally save successful captures and queue the corresponding sync operation.
- Implement collection versus duplicate inventory (`Pererecário` versus `Meu Brejo`), with personalities only in the main album and not on duplicate cards.
- Add repository-level automated tests for duplicate capture and resume after app restart.

## Milestone 2 — Real camera and fair capture

- Integrate camera preview and frog sprite overlay. The sprite is a screen overlay, not true spatial AR.
- Integrate location permissions and encounters with the established 35 m initial threshold and 40 m accuracy safeguard; no pressure to go to unsafe places.
- Retain unlimited shutter attempts, no escape/consumables, two-miss assistance, and a one-time reward per encounter.
- Implement the rarity weights **by tier** (60 common / 28 uncommon / 10 rare / 2 special), then randomly select a species within the chosen tier.
- Implement initial encounter as Folhinha and the proposed anti-frustration guarantees in `INTERACOES.md`.

## Milestone 3 — Login and synchronization

- Google sign-in with a stable player identity.
- Backend API with PostgreSQL as the authoritative remote state.
- Idempotent operation journal; acknowledge operations by unique ID, retry safely, and reconcile canonical server state without lost captures.
- Restore player state from the server on a second device and handle concurrent changes.
- No need to upload photos for progress synchronization.

## Milestone 4 — Trading, polish and shipping

- Only allow online trades of synchronized specimens, with atomic transfer and conflict checks.
- Physical device testing on Android, color filters/cheek animations, performance, permissions, offline resilience, and accessible sizes.
- Release packaging and privacy/security review.

## Boundaries

Current `lib/main.dart` is a visual catalog demo, not the completed game. Do not interpret HTML preview state as durable storage. Preserve the supplied sprite atlas and stable species IDs when building out features.
