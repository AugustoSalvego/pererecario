# Validation

- Passed: catalog has 15 unique IDs; all source rectangles are inside the 1619 × 971 atlas.
- Passed: category counts 6/5/3/1 and category weights sum to 100.
- Passed: embedded JavaScript syntax check with Node.
- Passed: mocked DOM/canvas interaction checks for 15 cards, rarity filter, species selection, silhouette, assistance after two misses, capture success and repeated shutter prevention.
- Not completed: browser visual rendering and real viewport checks. Chromium could not launch because this environment blocks its required socket operation. The included responsive CSS must still be verified in a real browser at 320, 360, 768 and 1280 px.
- Not completed: Flutter compilation, analyzer and Android device test; Flutter/Dart SDK is absent here.
- Not implemented in this kit: camera access/photo compositing, GPS encounters, Google authentication, SQLite, server synchronization, encounter guarantees and trade transactions.

Suggested manual review: open preview.html; inspect all 15 sprites; test common and special movement, miss two shots, photograph with assistance, toggle silhouettes, and enable reduced motion. Then build Flutter on a development machine and inspect notch/safe-area, large text and background/resume behavior.

## v0.2
- Passed: 15 different personality types, finite animation transforms, staggered phases, cycles of at least 6 seconds, and catalog identical to embedded HTML data.
- Passed again: JavaScript syntax and mocked interaction regression checks.
- Still pending: browser visual review of color filters and local cheek/throat deformation; Flutter compilation and physical device testing.

## Git repository baseline
- Added Python atlas/catalog regression check and Flutter catalog test.
- Added GitHub Actions checks (not yet executed remotely).
- Android scaffolding and full Flutter validation still need Flutter SDK or GitHub Actions.
