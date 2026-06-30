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

### Breaker write control

Breaker tiles are interactive. Clicking a tile in the dashboard sends a Signal K PUT to `/signalk/v1/api/vessels/self/sailsense/breakers/{key}/state`, which the plugin handles via `app.registerPutHandler`.

The put handler:
1. Looks up the breaker's hardware address in `BREAKER_MAP` (a module-level constant)
2. Builds the MQTT command payload (single output or `children` array for multi-rail)
3. Publishes to `cmd/{hubHostname}/send` — **the Hub's hostname, not the plugin's client ID**

`BREAKER_MAP` key format matches `toKey(breakerName)` exactly (spaces → `_`, hyphens preserved). The `name` field holds the original name for use in the MQTT `topic` field of the command payload.

**Critical:** The command topic is `cmd/{hubHostname}/send` where `hubHostname` comes from the `about/hostname` retained MQTT message. Using the plugin's own random client ID as the target (as DEVICES.md originally implied) will silently fail — the Hub never subscribed to that topic. The hub's hostname is subscribed to alongside the normal topic groups at `client.on('connect')` time.

### Dashboard webapp (`public/index.html`)

A single-file vanilla JS webapp served by Signal K at `/signalk-sailsense/`. No build step, no framework. Five tabs:

- **Home** — two sections: **Electrical** (House Battery cards, Solar Yield card, Loads card) and **Tanks** (combined fresh water + port/stbd blackwater tiles)
- **Power** — two sections: **House Batteries** (from `electrical.batteries.*`) above **Engine Batteries** (from `sailsense.batteries.*`); banks discovered dynamically
- **Tanks** — Port/Stbd fill gauges for fresh water, fuel, and blackwater
- **Breakers** — all 15 breakers with green/red on/off indicators
- **Lights & Pumps** — nacelle, exterior, and cabin light states; bilge and water pump states

Data flow: WebSocket at `/signalk/v1/stream` (primary, live) with REST polling every 3 s as fallback. The REST poll fetches five endpoints in parallel: `sailsense`, `electrical/batteries`, `electrical/solar`, `electrical/inverters`, and `electrical/venus`. The WebSocket subscribes to all five corresponding path prefixes. Tab state is persisted in the URL hash.

### Electrical cards (Home tab)

- **House Battery** — one card per `electrical.batteries.*` bank; labeled "House 1", "House 2", etc. by index. Displays Power (voltage × current, coloured: negative → `var(--red)`, positive → `#60a5fa`) and Current. Battery icon (`BATTERY_ICON`) in card title.
- **Solar Yield** — aggregates `electrical.solar.*.panelPower` (W) and `electrical.solar.*.current` (A) across all controllers. Amber progress bar scaled 0–2500 W. Sun icon (`SUN_ICON`) in card title.
- **AC Loads** — separate tile; Power/Current from `electrical.inverters.*.acout.power/.current` (summed). Amber progress bar 0–6000 W. AC sine-wave icon (`AC_ICON`) in card title.
- **DC Loads** — separate tile; DC Power from `electrical.venus.dcPower`; DC Current derived as `dcPower / batteryVoltage`. Amber progress bar 0–6000 W. DC symbol icon (`DC_ICON`) in card title.

All four electrical cards use a 2-column stat grid with a `% of Limit` utilization row spanning both columns, and a progress bar pinned to the card bottom via `margin-top: auto` on `.soc-bar`.

### Engine battery labels (Power tab)

Engine batteries (from `sailsense.batteries.*`) are labeled by inspecting the bank path: if it contains `port` → "Port", `stbd`/`starboard` → "Stbd", otherwise the raw dotted path. Do **not** use positional even/odd indexing — derive from the path.

## Conventions

- **No build step.** `index.js` and `public/index.html` are plain CommonJS/vanilla JS; no transpilation, no TypeScript, no bundler.
- **Test suite:** `node --test test/index.test.js` (Node 18+ built-in runner, zero extra dependencies). Tests cover `isLiveData`, `topicToPath`, `coerce`, and the plugin factory shape. The test mock for `app` does **not** include `registerPutHandler` — add it to `makeApp()` in the test if you need to test put handler registration.
- **Single dependency:** `mqtt` (^5.x). Do not add dependencies without being asked.
- **Signal K plugin API:** use `app.handleMessage()` to publish values, `app.setPluginStatus()` for status, `app.setPluginError()` for errors, `app.registerPutHandler(context, path, callback)` to handle writes. Always guard with `if (typeof app.registerPutHandler === 'function')` for compatibility with older SK server versions.
- **MQTT topic groups** are defined in `TOPIC_MAP` at the top of `index.js`. Adding a new group means adding an entry there plus a corresponding schema property in the `topics` object.
- **`isLiveData` is intentionally conservative.** It exists to suppress high-volume metadata noise. When in doubt, keep it strict.
- **Webapp path reads:** always read breaker state from `sailsense.breakers.{Name}.state` — the deeper `sailsense.breakers.{Name}.{Name}.state` path exists as a retained MQTT value but does not reflect live state.
- **`topicToPath` sanitisation** must be mirrored exactly in the webapp's `toKey()` function: `%` → `pct`, all non-`[a-zA-Z0-9_-]` characters → `_`.
- **Display labels vs. path keys are separate concerns.** In `BREAKERS` and `PUMP_GROUPS`, the strings are used both as display text and as input to `toKey()` to build Signal K paths. Changing the capitalisation or spelling of these strings changes the path and breaks data lookup. To rename something in the UI, use the `toLabel()` helper (applied at render time) rather than editing the raw string in the array. `LIGHT_GROUPS` entries are safe to rename because the `prefix` field is display-only and `toKey()` is called on the base name only.
- **`toLabel()` is the display transform.** It currently maps `STBD` → `Starboard`. Any further label changes (e.g. renaming `Port` to something else) should go through this function, not by editing the raw names in `BREAKERS` or `PUMP_GROUPS`.
- **`toTitleCase()` is applied at render time** to all breaker names (via `toTitleCase(toLabel(name))`) and all light/pump item labels (inside `renderLightItem`). Do not title-case the raw strings in `BREAKERS`, `LIGHT_GROUPS`, or `PUMP_GROUPS` — those must stay in their original form for path key generation and MQTT matching.
- **Tank volumes are displayed in US gallons**, not litres. Current fill and total capacity are both derived from the live Signal K data (`levels.L` and `levels.pct`) — total = `L * 100 / pct`. No hardcoded capacities in the render logic.
- **Tank card functions** both take `(label, subtitle, ...)` signatures: `renderTankCard(label, subtitle, levelPrefix, type)` and `renderTankCardFromValues(label, subtitle, pct, litres, type)`. The `subtitle` (e.g. `'Port'`, `'Starboard'`, `'Average'`) is rendered below the title in smaller muted text. The `type` param selects the icon and fill colour: `'water'` → blue, `'fuel'` → amber, `'black'` → grey.
- **Inline SVG icon constants** — all icons are 13×13 px strings (`fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `viewBox="0 0 24 24"`). Tank icons are selected by `type` in both render functions. Electrical card icons are embedded directly in the `battery-name` div. Current set:
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
