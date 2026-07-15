# Endless City

Endless City is an interactive low-poly WebGL city that streams a deterministic neighborhood around the camera. It preserves the original project’s models and elevated map-like visual style while adding genuinely unbounded travel, fixed-step four-direction traffic, mobile support, and bounded object pools.

## Preview

![Endless City preview](./preview.png)

## Explore

- Mouse: drag to move and scroll to zoom. Movement eases to a stop, and the viewing angle stays fixed.
- Touch: drag with one finger to move; pinch or drag with two fingers to move and zoom.
- Presentation: once loading completes, the canvas is the entire interface. Loading, recovery, and Retry appear only when the scene is unavailable.

Traffic adapts once at startup to the viewport. High quality uses 108 vehicle slots, balanced uses 72, and viewports narrower than 768 CSS pixels use 42. Every profile retains eastbound, westbound, northbound, and southbound traffic.

Each vehicle receives stateless, seed-derived driver traits for cruise speed, acceleration, braking, headway, and minimum gap. Route decisions start from a 55% straight, 22.5% left, and 22.5% right distribution, with a bounded profile adjustment to the straight share. Turns follow smooth curves between the authored incoming and outgoing lane centerlines. A car counts as protected while its conservative radial extent (`center distance - half length`) reaches the protected radius. The stationary-camera regression retains all 72 of its test slots and, after warm-up, at least 18 protected cars with at least 11 of those moving. The moving-camera regression also requires at least 18 visible cars and all four visible directions in every one-minute window.

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
bun run tiles:build
bun run typecheck
bun run test
bun run build
```

The build command runs strict TypeScript checking and emits a production site to `dist/`. The generated artifact is configured for `/Endless-City/`, matching this repository's GitHub Pages project URL; change the Vite base before hosting it at a different path.

Pushes to `master` run `.github/workflows/deploy.yml`, which builds and publishes `dist/`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** so the compiled site is deployed instead of the repository source files.

## Project structure

- `src/city/` — logical coordinates, deterministic layout, tile windows, and render-origin shifts.
- `src/traffic/` — seeded driver traits, lane and turn geometry, fixed-step following, movement conflict zones, spawning, and hidden recycling.
- `src/rendering/` — one-time asset loading, quality selection, Three.js scene setup, and pooled city/traffic views.
- `src/camera/` — map controls and bounded render-local camera coordinates.
- `src/ui/` — loading, recovery, and failure states shown only while the scene is unavailable.
- `src/app.ts` and `src/main.ts` — application lifecycle and browser bootstrap.
- `tests/` — deterministic unit, integration, lifecycle, and existing-asset contract tests.
- `js/clusters/` — original runtime assets plus the 12 repository-derived remix GLBs.
- `tools/tiles/` — validated recipes, offline GLB compiler, and local review gallery.

## Asset constraint

The city and vehicle visuals use the repository assets in `js/clusters/`. The original separable sources live in `js/gltf/`; twelve `remix-*.glb` tiles derive only from those source models through `bun run tiles:build`. The only runtime-generated visual is the bounded five-cloud low-poly atmosphere built from shared Three.js primitives; it adds no image, texture, model, or network asset. `preview.png` remains the project preview.

Do not import new models, generate new geometry, or add texture artwork without an explicit project-direction change. Before redistributing model derivatives outside this repository, confirm the provenance of the original model files.

## License

Released under the [MIT License](./LICENSE). Copyright © 2018 Tomasz Zielinski.
