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
