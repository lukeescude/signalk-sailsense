# signalk-sailsense

A Signal K plugin (Node.js, CommonJS) that bridges a SailSense Hub to Signal K via MQTT.

## Project layout

- `index.js` — the entire plugin (MQTT client, topic filtering, path mapping, value coercion)
- `public/index.html` — the built-in dashboard webapp (single-file, no build step)
- `package.json` — npm metadata; `signalk.*` fields are read by the Signal K AppStore
- `CHANGELOG.md` — required by Signal K; must follow Keep a Changelog format
- `DEVICES.md` — hardware reference for breakers, lights, tanks, and Powerail outputs

## Architecture

The plugin is a single Signal K plugin module. It exports a factory function `(app) => plugin` that returns an object with `id`, `name`, `description`, `schema`, `start(settings)`, and `stop()`.

Key functions in `index.js`:
- `isLiveData(topic)` — filters MQTT topics to only forward live sensor values (not metadata, config, or label blobs)
- `topicToPath(topic)` — converts an MQTT topic to a `sailsense.*` Signal K path (strips `children` segments, sanitizes special chars)
- `coerce(str)` — converts string MQTT payloads to native JS types (boolean, number, parsed JSON, or string)

Key plugin-scope closure variables in `start()`:
- `client` — the active MQTT client; `null` when stopped
- `activeClientId` — the plugin's own random MQTT client ID (used only as the connection's `clientId` option, not for command routing)
- `hubHostname` — the Hub's own MQTT hostname, read from the retained `about/hostname` topic at connection time (e.g. `H0201DUGW`); this is the target for all control commands

### Breaker, light, and pump write control

Breaker tiles **and** Lights & Pumps tiles are both interactive, sharing the same control architecture. Clicking a breaker tile PUTs to `/signalk/v1/api/vessels/self/sailsense/breakers/{key}/state`; clicking a light/pump tile PUTs to `/signalk/v1/api/vessels/self/sailsense/actions/{group}/{key}/state`. Both are handled via `app.registerPutHandler`.

Each put handler:
1. Looks up the device's hardware address — `BREAKER_MAP` for breakers, `ACTION_MAP[group]` for lights/pumps (both module-level constants in `index.js`)
2. Builds the MQTT command payload via the shared `publishToggle(entry, mqttTopic, value, done)` helper (single output, or a `children` array for multi-rail devices like Fans or Foredeck courtesy light)
3. Publishes to `cmd/{hubHostname}/send` — **the Hub's hostname, not the plugin's client ID**

`BREAKER_MAP`/`ACTION_MAP` key format matches `toKey(name)` exactly (spaces → `_`, hyphens preserved). The `name` field on each entry holds the original name for use in the MQTT `topic` field of the command payload. `ACTION_MAP` is namespaced by Signal K action group (`exterior_light`, `nacelle_lights`, `port_lights`, `stbd_lights`, `bilge_pumps`, `water_pump`) since the same base name (e.g. `reading_light`) is reused across `port_lights`/`stbd_lights` with different hardware addresses. The command `topic` field differs slightly by category: breakers repeat the name twice (`breakers/children/{Name}/children/{Name}`), actions use it once (`actions/children/{group}/children/{name}`) — see `DEVICES.md` Command Reference.

**Critical:** The command topic is `cmd/{hubHostname}/send` where `hubHostname` comes from the `about/hostname` retained MQTT message. Using the plugin's own random client ID as the target (as DEVICES.md originally implied) will silently fail — the Hub never subscribed to that topic. The hub's hostname is subscribed to alongside the normal topic groups at `client.on('connect')` time.

The webapp generalizes this with a single `putState(skPath, value)` function (and shared `pendingPut`/401-login-overlay retry flow) used by both `toggleBreaker(key, value)` and `toggleAction(group, key, value)`. Like breakers, Lights & Pumps tiles are built once by `initLights()` (called at boot alongside `initBreakers()`) with click handlers bound to stable DOM nodes; `renderLights()` only updates `.light-dot` classes on each render cycle — do not rebuild tile `innerHTML` on every render, or click bindings would need constant rebinding and tapping could hit a stale node mid-rebuild.

### Dashboard webapp (`public/index.html`)

A single-file vanilla JS webapp served by Signal K at `/signalk-sailsense/`. No build step, no framework. Five tabs:

- **Home** — at-a-glance dashboard: 2×2 grid of large, high-contrast cards sized to fill a 1040×750 screen with no scrolling (House Bank charge + power, Diesel Tanks, Fresh Water Average, Black Water Tanks). See "Home tab" below.
- **Power** — two sections: **Batteries** (House Battery cards from `electrical.batteries.*` followed by Port/Stbd Engine Battery cards from `sailsense.batteries.*`, banks discovered dynamically) and **Loads** (Solar Yield, AC Loads, DC Loads cards)
- **Tanks** — Port/Stbd fill gauges for fresh water, fuel, and blackwater
- **Breakers** — all 15 breakers with green/red on/off indicators
- **Lights & Pumps** — four sections: Exterior Lights, Interior Lights (nacelle + port/stbd cabin lights merged under one display heading), Bilge Pumps, Water Pumps

Data flow: WebSocket at `/signalk/v1/stream` (primary, live) with REST polling every 3 s as fallback. The REST poll fetches five endpoints in parallel: `sailsense`, `electrical/batteries`, `electrical/solar`, `electrical/inverters`, and `electrical/venus`. The WebSocket subscribes to all five corresponding path prefixes. Tab state is persisted in the URL hash.

### Electrical cards (Power tab, Loads section)

- **House Battery** — one card per `electrical.batteries.*` bank; labeled "House 1", "House 2", etc. by index. Displays Power (voltage × current, coloured: negative → `var(--red)`, positive → `#60a5fa`) and Current. Battery icon (`BATTERY_ICON`) in card title. Rendered in the Batteries section, not Loads.
- **Solar Yield** — aggregates `electrical.solar.*.panelPower` (W) and `electrical.solar.*.current` (A) across all controllers. Amber progress bar scaled 0–2500 W. Sun icon (`SUN_ICON`) in card title.
- **AC Loads** — separate tile; Power/Current from `electrical.inverters.*.acout.power/.current` (summed). Amber progress bar 0–6000 W. AC sine-wave icon (`AC_ICON`) in card title.
- **DC Loads** — separate tile; DC Power from `electrical.venus.dcPower`; DC Current derived as `dcPower / batteryVoltage`. Amber progress bar 0–6000 W. DC symbol icon (`DC_ICON`) in card title.

All four electrical cards use a 2-column stat grid with a `% of Limit` utilization row spanning both columns, and a progress bar pinned to the card bottom via `margin-top: auto` on `.soc-bar`.

### Engine battery labels (Power tab)

Engine batteries (from `sailsense.batteries.*`) are labeled by inspecting the bank path: if it contains `port` → "Port", `stbd`/`starboard` → "Stbd", otherwise the raw dotted path. Do **not** use positional even/odd indexing — derive from the path.

### Home tab

Four `.home-card` tiles in a `.home-grid` (CSS Grid, 2 columns × 2 rows, `height: calc(100vh - 53px)`) — tuned to fit a 1040×750 screen (the target MFD resolution) without scrolling. `#tab-home` overrides the generic `.panel` padding to 0 so `.home-grid` controls its own spacing.

- **House Bank** — average `capacity.stateOfCharge` across all `electrical.batteries.*` banks (`homeHouseBankSummary()`), huge percentage via `.home-value` (5.5rem), coloured via `socColor()`, with a thick `.home-bar-fill` progress bar. Charge/discharge power (sum of `voltage × current` across house banks) is shown in the same tile via `.home-power-row`, below the bar — `var(--red)` + "Discharging" when negative, `var(--green)` + "Charging" when positive.
- **Diesel Tanks** — Port and Stbd shown **individually** (not averaged) side by side in a `.home-split` row, from `gazoil_tanks.*.levels`, amber (`#f59e0b`) fill to match `.tank-fill.fuel`.
- **Fresh Water — Average** — `avgPair()` of Port/Stbd `water_tanks.*.levels.pct`; total gallons from `sumPair()` of the `.levels.L` values via `litresToGal()`.
- **Black Water Tanks** — Port and Stbd shown **individually** (not averaged) side by side in a `.home-split` row, each with its own `.home-split-value` percentage and gallons — the brief calls for seeing each tank's fill, not a combined number.

`renderHomeSplitTank(label, pct, litres, color)` is the shared renderer for both the Diesel and Black Water split tiles — pass the fill colour in (`#f59e0b` fuel, `#6b7280` black water) rather than forking the function. `avgPair()` / `sumPair()` are the generic two-value null-safe helpers reused here for the fresh water math. Icon size inside `.home-label` is bumped via CSS (`.home-label svg { width: 1.3em; height: 1.3em; }`) rather than changing the shared 13×13 icon constants — keep that pattern when sizing icons up for a specific context.

**Responsive breakpoints** (`@media` queries are scoped per-tab by selector prefix — `.home-*` classes or `#tab-power`/`#tab-tanks` IDs — so each tab's mobile rules can't leak into another tab):
- `(max-width: 700px), (max-height: 500px)` — covers phones in portrait and landscape.
  - **Home**: `.home-grid` drops the fixed `height: calc(100vh - 53px)` and switches to `grid-template-columns: 1fr` with `height: auto`, so the tab scrolls instead of trying to cram a 2×2 grid into a short/narrow viewport. Font sizes scale down (`.home-value` 5.5rem → 3.25rem, etc.) but the title-pinned-top / body-vertically-centered structure from `.home-card-body` is unchanged.
  - **Power / Tanks**: rules are scoped via `#tab-power .battery-group, #tab-tanks .tank-card` etc. (not the bare `.battery-group`/`.tank-card` selectors) so Home is never affected. `.grid`'s `auto-fill, minmax(220px, 1fr)` already collapses to one column on a phone-width screen with no extra rule needed — this breakpoint only tightens `.panel`/`.tank-group`/`.grid` spacing and grows `.stat-value`/`.tank-pct` (1.35rem → 1.6rem) for legibility.
- `(max-width: 430px)` — narrow phones additionally stack `.home-split` (Port/Stbd) vertically instead of side by side, since two columns get too cramped below ~430px.
- `(max-width: 460px)` — **Breakers**: `.breaker-grid`'s `minmax(460px, 1fr)` track is wider than any phone viewport, which forces horizontal scroll (`auto-fill` still allocates the 460px minimum even when the container is narrower). Scoped `#tab-breakers .breaker-grid` rule collapses it to `grid-template-columns: 1fr` below this width instead of trying to shrink the 460px minimum.

The desktop/MFD 1040×750 no-scroll layout is the default (unprefixed) ruleset for every tab and must stay pixel-identical — verify with a 1040×750 screenshot after touching any responsive CSS. **Lights & Pumps** has not been given phone breakpoints — its `.light-grid` (`minmax(200px, 1fr)`) already fits phone widths without one, so none was added; revisit if that ever changes.

## Conventions

- **No build step.** `index.js` and `public/index.html` are plain CommonJS/vanilla JS; no transpilation, no TypeScript, no bundler.
- **Test suite:** `node --test test/index.test.js` (Node 18+ built-in runner, zero extra dependencies). Tests cover `isLiveData`, `topicToPath`, `coerce`, and the plugin factory shape. The test mock for `app` does **not** include `registerPutHandler` — add it to `makeApp()` in the test if you need to test put handler registration.
- **Single dependency:** `mqtt` (^5.x). Do not add dependencies without being asked.
- **Signal K plugin API:** use `app.handleMessage()` to publish values, `app.setPluginStatus()` for status, `app.setPluginError()` for errors, `app.registerPutHandler(context, path, callback)` to handle writes. Always guard with `if (typeof app.registerPutHandler === 'function')` for compatibility with older SK server versions.
- **MQTT topic groups** are defined in `TOPIC_MAP` at the top of `index.js`. Adding a new group means adding an entry there plus a corresponding schema property in the `topics` object.
- **`isLiveData` is intentionally conservative.** It exists to suppress high-volume metadata noise. When in doubt, keep it strict.
- **Webapp path reads:** always read breaker state from `sailsense.breakers.{Name}.state` — the deeper `sailsense.breakers.{Name}.{Name}.state` path exists as a retained MQTT value but does not reflect live state.
- **`topicToPath` sanitisation** must be mirrored exactly in the webapp's `toKey()` function: `%` → `pct`, all non-`[a-zA-Z0-9_-]` characters → `_`.
- **Display labels vs. path keys are separate concerns.** In `BREAKERS`, `LIGHT_GROUPS`, and `PUMP_GROUPS`, the name strings are used both as display text and as input to `toKey()` to build Signal K paths. Changing the capitalisation or spelling of these strings changes the path and breaks data lookup. To rename something in the UI, use the `toLabel()` helper (applied at render time) rather than editing the raw string in the array — `renderLights()` calls `toLabel(n)` on every `LIGHT_GROUPS`/`PUMP_GROUPS` base name before display, same as breakers. The `prefix` field on `LIGHT_GROUPS` entries (e.g. `'Port '`) is the one piece that *is* safe to edit directly — it's display-only and `toKey()` is called on the base name `n` alone, never on `prefix + n`.
- **`LIGHT_GROUPS`' `section` field is a separate display-grouping concern from `group`.** `section` controls which Lights & Pumps tab heading (Exterior Lights / Interior Lights) a `LIGHT_GROUPS` entry's items render under; `group` is the underlying Signal K action group used to build the path and is independent of how items are visually grouped. Multiple `LIGHT_GROUPS` entries can share a `section` (e.g. nacelle + port + starboard cabin lights all render under "Interior Lights") without merging their underlying `group`/path data.
- **`toLabel()` is the display transform.** It currently maps `STBD` → `Starboard`. Any further label changes (e.g. renaming `Port` to something else) should go through this function, not by editing the raw names in `BREAKERS` or `PUMP_GROUPS`.
- **`toTitleCase()` is applied at render time** to all breaker names (via `toTitleCase(toLabel(name))`) and all light/pump item labels (inside `renderLightItem`). Do not title-case the raw strings in `BREAKERS`, `LIGHT_GROUPS`, or `PUMP_GROUPS` — those must stay in their original form for path key generation and MQTT matching.
- **Tank volumes are displayed in US gallons**, not litres. Current fill and total capacity are both derived from the live Signal K data (`levels.L` and `levels.pct`) — total = `L * 100 / pct`. No hardcoded capacities in the render logic.
- **Tank card function** takes a `(label, subtitle, levelPrefix, type)` signature: `renderTankCard(label, subtitle, levelPrefix, type)`. The `subtitle` (e.g. `'Port'`, `'Starboard'`) is rendered below the title in smaller muted text. The `type` param selects the icon and fill colour: `'water'` → blue, `'fuel'` → amber, `'black'` → grey.
- **Gallon math is centralised.** `tankCapacityL(litres, pct)` derives a tank's total capacity in litres from its current litres and fill `%` (`litres * 100 / pct`); `litresToGal(l)` converts litres → US gallons; `galLabel(currentGal, totalGal, dp)` formats the `"X / Y gal"` string shown under every tank progress bar (Tanks tab cards and the Home tab's Diesel/Fresh Water/Black Water tiles). Always derive capacity through `tankCapacityL`, never hardcode tank sizes in render logic — `DEVICES.md` documents the physical capacities for reference only.
- **Inline SVG icon constants** — all icons are 13×13 px strings (`fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `viewBox="0 0 24 24"`). Tank icons are selected by `type` in `renderTankCard`. Electrical card icons are embedded directly in the `battery-name` div. Current set:
  - `WATER_ICON` — water droplet (fresh water tanks)
  - `TOILET_ICON` — side-view toilet: tank (right), seat bar, U-bowl, pedestal (black water tanks)
  - `ENGINE_ICON` — engine block: rect body, left bracket prongs, right D-shape, intake cap (diesel tanks)
  - `BATTERY_ICON` — car battery: landscape rect, two terminal posts, − and + symbols (House Battery card)
  - `SUN_ICON` — circle with 8 rays (Solar Yield card)
  - `AC_ICON` — sine wave S-curve (AC Loads card)
  - `DC_ICON` — two horizontal lines, bottom dashed (DC Loads card)
- **Icon alignment** — both `.tank-name` and `.battery-name` use `display: (inline-)flex; align-items: center;` with `.tank-name svg, .battery-name svg { margin-right: 0.3rem; flex-shrink: 0; }`. When adding icons to new card titles, follow this CSS pattern rather than inline styles.
- **AppStore screenshots** are in `screenshots/` and listed in `package.json` under `signalk.screenshots`. The directory is also included in the `files` array so it ships with the npm package.

## Browser compatibility

The dashboard must run on **Chrome 70** (the embedded Chromium on B&G Zeus 3 and similar MFDs). Do not use JS or CSS features introduced after Chrome 70.

**CSS — do not use:**
- `gap` on `display: flex` containers (Chrome 84+). Use `margin-right`/`margin-left` on child elements instead. `gap` on `display: grid` is fine (Chrome 66+).

**JS — do not use:**
- Nullish coalescing `??` (Chrome 80+) — use `x != null ? x : fallback`
- Optional chaining `?.` (Chrome 80+)
- `Object.fromEntries` (Chrome 73+)
- `String.prototype.replaceAll` (Chrome 85+)
- `Array.prototype.at` / `String.prototype.at` (Chrome 92+)

**Safe to use (Chrome 57+):** `const`/`let`, arrow functions, template literals, destructuring, `async`/`await`, `fetch`, `WebSocket`, `for...of`, `Object.entries`, `Object.keys`, CSS custom properties, CSS Grid.

## Authentication

The dashboard reads `window.SK_TOKEN` at startup. This variable is injected by `signalk-navico-embedder` when a token is configured there — it allows the MFD (which has no Signal K session cookie) to authenticate API and WebSocket requests.

- If `window.SK_TOKEN` is set, it is sent as `Authorization: Bearer <token>` on REST fetches and appended as `?token=<token>` to the WebSocket URL.
- If it is absent (direct browser access), the existing session cookie handles authentication automatically.
- If a REST fetch returns 401, `showAuthError()` renders an actionable message across all tabs instead of silently showing empty panels.

## Signal K path convention

`sailsense.<topic-with-children-stripped-and-slashes-as-dots>`

Example: `batteries/children/Main/children/Bank1/voltage` → `sailsense.batteries.Main.Bank1.voltage`

## Local development

```bash
# Install Signal K server (one-time)
npm install -g signalk-server

# Link the plugin into the server's config directory
npm link
cd ~/.signalk && npm link signalk-sailsense

# Start the server
/opt/homebrew/bin/signalk-server --port 3000

# Dashboard: http://localhost:3000/signalk-sailsense/
# Admin UI:  http://localhost:3000/admin
```

After any change to `index.js` or `public/index.html`, restart the server — no re-linking needed since `npm link` uses a live symlink.

## Versioning

Version lives in `package.json`. The plugin follows semver; bump the patch for bug fixes, minor for new topic groups or features. Always update `CHANGELOG.md` when bumping the version.
