# Pererecário — mobile game interface v2

## Product decision
The app is a portrait-first browser game (PWA), not a four-column dashboard. Its primary view is the campus field map. Desktop presents the same gameplay with a complementary sidebar, without shrinking the phone experience into unreadable cards.

## What changed and why

| Area | Earlier issue | v2 approach |
| --- | --- | --- |
| Welcome | Form-like intro | Illustrated immersive splash, explorer name and recovery on a dedicated bottom sheet |
| Exploration | Large administrative overview, small map | Full-width large map, game HUD, five habitats, nearby encounter cards |
| Map pins | 15 large overlapping random-looking pins at campus zoom | One habitat marker per course at campus zoom; tap opens encounters, zoom to 18 shows exact encounter pins |
| Capture | Dialog lacking game atmosphere | Edge-to-edge phone photo minigame, big shutter, live focus and clear instructions |
| Album | Very small creatures on phone | Two-column collection, large sprite cards, rarity clues and hidden silhouettes |
| Special Estrelinha | Looked like an ordinary item or oddly placed marker | Only assigned to Computação by catalog; special card and species portrait use a dedicated midnight sky and starlight styling |
| Meu Brejo | Inventory looked utilitarian | Two-column creature homes, specimen measurements, habitat and favorite stars |
| Profile | Generic stats dashboard | Explorer passport, adventure points, podium ranking, scrapbook history and sync/recovery drawer |

## Gameplay behavior
- All fifteen approved frogs keep stable IDs, crop rectangles and original personality animations.
- Five fixed campus zones have three exclusive species each. Every encounter gets a stable ID per half-hour slot. Capture distance is 35 m, accuracy requirement is 40 m. Unknown frog species stay hidden in collection until captured.
- Campus overview clusters pins by habitat to avoid stacking. Zoom to maximum for encounter coordinates. These points are **provisional**, NOT surveyed accessible footpaths, and must be validated before inviting a public audience to follow them.
- Demo mode is available only on localhost (`?demo=1`); demo captures use a distinct IndexedDB database and never reach official score.
- Offline is backed by IndexedDB and a Service Worker. Local operations are committed before showing rewards; subsequent sync is idempotent and resolves same-encounter conflicts in server order.

## Mobile acceptance, outstanding
- [ ] On an actual Android Chrome and iOS Safari, check welcome, GPS prompt, map touch/pinch, habitat marker selection, capture, album details, Meu Brejo and profile at 360, 390 and 430 CSS px.
- [ ] Check keyboard overlay, large text, orientation, reduced motion and screen readers.
- [ ] Check offline close/reopen and reconnect with an installed PWA, using the real hosted HTTPS origin.
- [ ] Confirm the areas are physically safe and the location markers represent accessible paths before encouraging walking.
- [ ] Check a second browser/devices reproduces server data after recovery.

The test harness available during this revision refused browser page navigation even to `about:blank` and `localhost` (`ERR_BLOCKED_BY_ADMINISTRATOR`). Do not represent the UI as manually browser-verified until these checks are completed on an actual device.
