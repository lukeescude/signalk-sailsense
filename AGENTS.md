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

### Dashboard webapp (`public/index.html`)

A single-file vanilla JS webapp served by Signal K at `/signalk-sailsense/`. No build step, no framework. Four tabs:

- **Power** — battery bank cards (voltage, current, SOC bar); banks are discovered dynamically by scanning `sailsense.batteries.*` keys
- **Tanks** — PORT/STBD fill gauges for fresh water, fuel, and blackwater
- **Breakers** — all 15 breakers with green/red on/off indicators
- **Lights & Pumps** — nacelle, exterior, and cabin light states; bilge and water pump states

Data flow: WebSocket at `/signalk/v1/stream` (primary, live) with REST polling of `/signalk/v1/api/vessels/self/sailsense` every 3 s as fallback. Tab state is persisted in the URL hash.

## Conventions

- **No build step.** `index.js` and `public/index.html` are plain CommonJS/vanilla JS; no transpilation, no TypeScript, no bundler.
- **No test suite.** There is no test framework configured (`npm test` exits 1). Do not add one without being asked.
- **Single dependency:** `mqtt` (^5.x). Do not add dependencies without being asked.
- **Signal K plugin API:** use `app.handleMessage()` to publish values, `app.setPluginStatus()` for status, `app.setPluginError()` for errors. Do not use Signal K APIs not already present in the file.
- **MQTT topic groups** are defined in `TOPIC_MAP` at the top of `index.js`. Adding a new group means adding an entry there plus a corresponding schema property in the `topics` object.
- **`isLiveData` is intentionally conservative.** It exists to suppress high-volume metadata noise. When in doubt, keep it strict.
- **Webapp path reads:** always read breaker state from `sailsense.breakers.{Name}.state` — the deeper `sailsense.breakers.{Name}.{Name}.state` path exists as a retained MQTT value but does not reflect live state.
- **`topicToPath` sanitisation** must be mirrored exactly in the webapp's `toKey()` function: `%` → `pct`, all non-`[a-zA-Z0-9_-]` characters → `_`.

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
