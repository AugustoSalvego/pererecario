# Pererecário 🐸

An offline-first mobile frog collection game with original pixel-art creatures. This repository starts from the **Visual Kit v0.2**: 15 species, a sprite atlas, individual album personalities, and a Flutter catalog prototype.

> **Development status:** Visual prototype only. The HTML demo simulates discovery and capturing; it does **not** save progress persistently. Real camera/GPS integration, Google sign-in, local database, backend synchronization, and trades are not implemented yet.

## Included in this baseline

- `assets/frogs_atlas.png` — approved pixel-art atlas for all 15 species.
- `assets/species.json` — persistent species IDs, rarities, image rectangles, and album personalities.
- `lib/frog_sprite.dart` — reusable Flutter painter for pixel-perfect animation, silhouettes and reduced-motion support.
- `lib/main.dart` — Flutter visual catalog demonstration.
- `preview.html` — self-contained browser preview; open locally, no server needed.
- `docs/INTERACOES.md` — original gameplay and interaction decisions (Portuguese).
- `docs/ROADMAP.md` — proposed implementation order and persistence/sync architecture.
- `scripts/validate_catalog.py` — basic catalog/atlas integrity validation.

## Preview without Flutter

Open `preview.html` in a browser. It is a **non-persistent visual sandbox**; progress resets after refresh.

## Run the Flutter demo (Android)

Install the Flutter SDK and Android SDK first. From the repository directory:

```bash
flutter doctor
flutter create --platforms=android .
flutter pub get
flutter run
```

`flutter create` fills in the missing Android project scaffolding without replacing the existing app source files. If asked to overwrite existing files, stop and review the proposed changes. Android-generated files can be committed to this repository after verification.

## Validate

```bash
python3 scripts/validate_catalog.py
flutter analyze
flutter test
```

Flutter/Android compilation requires a Flutter toolchain; it has not been confirmed in the environment that prepared this repository. The project includes a CI workflow to run validation and basic Flutter checks on pushes.

## GitHub workflow

Clone once; then use `git pull` to receive changes and `git add` / `git commit` / `git push` to publish your own. See `docs/GIT_WORKFLOW.md` for the initial publication steps.

## Roadmap

1. Local SQLite persistence for encounters, unique captures and inventory.
2. Real camera overlay and GPS-gated encounters, using fair capture mechanics.
3. Google login and backend API with PostgreSQL + idempotent synchronization.
4. Trading, encounter balancing, Android device validation, and release polish.

The established gameplay rules take precedence over any roadmap suggestion. In particular: no impossible catches; assistance after two missed attempts; no loss of a captured frog because connectivity fails; and special album animations only for each discovered species in the main album.

## Author

**Danilo Augusto Salvego dos Santos**  
GitHub: [AugustoSalvego](https://github.com/AugustoSalvego)
