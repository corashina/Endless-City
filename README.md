# Endless City

Endless City is an interactive low-poly WebGL city that streams a deterministic neighborhood around the camera. It preserves the original project’s models and elevated map-like visual style while adding genuinely unbounded travel, fixed-step four-direction traffic, mobile support, and bounded object pools.

## Preview

![Endless City preview](./preview.png)

## Explore

- Mouse: drag to move and scroll to zoom. The viewing angle is fixed.
- Touch: drag with one finger to move; pinch or drag with two fingers to move and zoom.
- Interface: use **How to explore** to reopen the help panel. Performance statistics are opt-in; `?debug=1` shows them immediately.

Traffic adapts once at startup to the viewport. High quality uses 49 vehicle slots, balanced uses 32, and viewports narrower than 768 CSS pixels use 20. Every profile retains eastbound, westbound, northbound, and southbound traffic.

## Run locally

Prerequisites:

- [Bun](https://bun.sh/) with its current stable runtime
- A current browser with WebGL and hardware acceleration

Install dependencies and start the Vite development server:

```powershell
bun install
bun run dev
```

Vite prints the local URL. Open it in the browser; source edits reload automatically.

## Verify and build

Run each project gate independently:

```powershell
bun run typecheck
bun run test
bun run build
```

The build command runs strict TypeScript checking and emits a production site to `dist/`. Deploy the contents of `dist/` to any static host. The application uses root-relative URLs, so host it at the domain or configured site root.

## Project structure

- `src/city/` — logical coordinates, deterministic layout, tile windows, and render-origin shifts.
- `src/traffic/` — lane geometry, fixed-step following, intersection reservations, spawning, and hidden recycling.
- `src/rendering/` — one-time asset loading, quality selection, Three.js scene setup, and pooled city/traffic views.
- `src/camera/` — map controls and bounded render-local camera coordinates.
- `src/ui/` — loading, help, diagnostics, failure, and recovery states.
- `src/app.ts` and `src/main.ts` — application lifecycle and browser bootstrap.
- `tests/` — deterministic unit, integration, lifecycle, and existing-asset contract tests.
- `js/clusters/` — the original GLTF/GLB visual assets reused by the redesign.
- `docs/architecture.md` — maintainer guide to streaming, traffic, rendering, and errors.
- `docs/legacy-audit.md` — original failure analysis and replacement invariants.

## Asset constraint

The redesign adds no 3D models, textures, images, icons, or generated geometry. Runtime visuals come from the existing files in `js/clusters/`; `preview.png` remains the project preview. Code changes should preserve that constraint unless the project direction is explicitly changed.

## License

Released under the [MIT License](./LICENSE). Copyright © 2018 Tomasz Zielinski.
