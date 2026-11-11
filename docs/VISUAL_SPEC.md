# Pererecário — visual experience v0.4

## Visual direction

- **Feeling:** a warm illustrated field journal, inviting and collectible rather than competitive.
- **Palette:** forest green `#27543d`, deep ink `#203e30`, ivory paper `#faf7ee`, light sage `#e5edde`.
- **Rarity accents:** common = leaf green; uncommon = mint; rare = lilac; special = warm gold with a midnight-blue stage.
- **Type:** friendly interface sans-serif + a bookish serif for story headings. All layouts have system font fallbacks.
- **Art:** keep the approved 15-creature PNG atlas and its stable IDs/rectangles; do not distort or change the original pixel shapes.

## Screens and states

### Main album

The landing view offers a collection summary, discovery progress, rarity filters, and searchable cards. Discovered creatures show full art; undiscovered creatures use a restrained grey silhouette, `???` label, and a discreet lock icon. Rarity is never revealed for a missing species in the main grid.

### Species sheet

Tap a card to open a species detail with artwork, catalog number, rarity, bio, and its unique trait. A trait starts its first animation almost immediately and repeats with a rest. A tap button triggers a playful hop. The special Estrelinha keeps the midnight-stage and gold/blue constellation effect introduced in v0.3.

### Capture experience

A landscaped **simulated viewfinder** includes species position, framing target, large shutter control, hint text, and a capture result. On two framing errors, an assist holds the frog in the center. There are no attempt limits, escapes, timers or penalties. New discoveries use a celebratory reveal; already collected species show a softer duplicate capture. The simulation does not access the device camera or GPS.

### Meu Brejo (duplicates)

List every individual specimen, with repeated species permitted. No trait performances play in this inventory. The item card shows a stable-looking sample label and size; production IDs and sizes must come from persisted backend data, **not** this demo state.

### Guide and presentation controls

A dedicated guide explains rarity badges, unique character interactions, reduced motion and a review-only option to reveal the 15 approved sprites. Restore resets demo-only state.

## Responsive layout

- Large desktop: dedicated sidebar; spacious catalog and a two-column capture layout.
- Tablet/mobile: bottom navigation; two-column creature cards, single-column capture and detail dialog.
- Buttons have accessible tap targets, keyboard focus styles, semantic labels and reduced-motion support.

## Implementation boundary

The HTML experience (`preview.html` + `visual/app.css` + `visual/app.js`) and Flutter demo (`lib/main.dart`) are **visual prototypes**. Discovery and inventory examples live in memory and reset after restarting/reloading. No camera, GPS, account, trading, local persistence, sync, or backend endpoints are implemented yet. These belong to the engineering milestones after visual approval.

## Future acceptance checklist

- [ ] Review album, undiscovered cards and each rarity on phone and desktop.
- [ ] Verify modal and navigation at narrow widths.
- [ ] Verify all 15 sprite atlas crops, preserving original art.
- [ ] Confirm Estrelinha effects remain pleasing and do not flash.
- [ ] Verify no hover-only controls and a working reduced-motion switch.
- [ ] Run `flutter analyze`, `flutter test`, and on-device layout tests once Flutter SDK is available.
