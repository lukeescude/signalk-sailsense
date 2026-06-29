# Changelog

## 1.2.1

### Fixed
- Breaker tiles now work on touchscreen clients (iPhone, MFD) that have no Signal K session cookie. The dashboard detects a 401 response and shows an in-page login overlay; after entering Signal K credentials the JWT is stored in `sessionStorage` and the command is retried automatically. Subsequent taps reuse the stored token without prompting again.
- PUT requests now send the auth token via both `Authorization: Bearer` header and `?token=` query parameter to maximise compatibility across Signal K server versions and middleware ordering.

## 1.2.0

### Added
- **Home tab** added to the dashboard with two summary sections: **Electrical** and **Tanks**
- **Electrical section** on the Home tab shows three cards side by side:
  - *House Battery* cards (one per bank from `electrical.batteries.*`) with voltage, current, SOC bar; current coloured red when discharging, blue when charging
  - *Solar Yield* card aggregating panel power (W) and current (A) across all `electrical.solar.*` controllers, with an amber progress bar scaled 0–2500 W
  - *Loads* card showing AC Power and AC Current (from `electrical.inverters.*.acout`) and DC Power and DC Current (derived from `electrical.venus.dcPower` and battery voltage)
- **Tanks section** on the Home tab shows combined fresh water, port blackwater, and starboard blackwater tiles
- **House Batteries** section added to the Power tab above Engine Batteries
- **Engine Batteries** section label added to Power tab; battery names derived from Signal K path (port/stbd)
- Tank volumes now displayed in **US gallons** with "current / total" format (e.g. `47.3gal/75gal`); total capacity derived dynamically from live data
- All breaker and light/pump labels now **title-cased** at render time
- Display labels (`Port`, `Stbd`) decoupled from Signal K path keys via `toLabel()` and `toTitleCase()` helpers
- AppStore screenshots wired up in `package.json` under `signalk.screenshots`
- `favicon.ico` (16×16, 32×32, 48×48) and `apple-touch-icon.png` (180×180) generated from `icon.png` and referenced in the dashboard

## 1.1.0

### Added
- Built-in web dashboard served at `/signalk-sailsense/` — no installation or build step required
- Four tabs: **Power** (battery voltage, current, SOC), **Tanks** (fresh water, fuel, blackwater fill gauges), **Breakers** (15 circuit breakers with live on/off indicators), **Lights & Pumps** (nacelle, exterior, cabin lights; bilge and water pumps)
- Real-time data via WebSocket with 3-second REST polling fallback
- Battery banks discovered dynamically — no hardcoded bank names required
- Vessel name fetched from Signal K and displayed as the dashboard title; falls back to "SailSense Hub" if not set
- Tab deep-linking via URL hash (`#power`, `#tanks`, `#breakers`, `#lights`)
- Auth support: reads `window.SK_TOKEN` (injected by `signalk-navico-embedder`) so the dashboard works on MFDs that have no Signal K session cookie
- Actionable 401 error message shown across all tabs instead of silently displaying empty panels
- Compatible with Chrome 70+ (including B&G Zeus 3 and similar Navico MFDs)

### Fixed
- Breaker live state now read from `sailsense.breakers.{Name}.state` — the hub also publishes a stale retained path one level deeper that was causing all breakers to show as off

## 1.0.8

### Fixed
- `CHANGELOG.md` added to the `files` array in `package.json` so it is included in the published npm package

## 1.0.7

### Fixed
- Changelog version headers reformatted from `## [x.x.x] - date` to `## x.x.x` to comply with Signal K AppStore parsing requirements

## 1.0.6

### Added
- `logo.png` (512×512) included in the published npm package via the `files` field
- `signalk.appIcon` set in `package.json` so the logo appears in the Signal K AppStore

## 1.0.5

### Fixed
- Shortcut devices (anchor, engine, navigation, and deck lights) now correctly subscribed — they live under the `contents/action_shortcut/#` topic tree, not `actions/#`. The previous 1.0.4 filter suffix was incorrect; no shortcut data was reaching Signal K.

## 1.0.4

### Added
- `contents/action_shortcut` topics now pass the live-data filter — these carry the available actions (e.g. shortcut commands) for lights and other devices under `actions/#`

## 1.0.3

### Fixed
- Powernet voltmeter and input filters now match the actual MQTT topic structure (blob at `voltmeters/{N}` and `inputs/{N}`) — previously the filter expected a `/value` sub-topic that does not exist, so no voltmeter or input data was reaching Signal K
- Powernet output settings filter now captures the `outputs/{N}/settings` blob rather than `settings/state`, `settings/current`, and `settings/temp` sub-topics that do not exist — output state, amperage, and temperature were previously silently dropped

### Added
- `powernet/device/powerail/{N}/hull` — bus bar positive/negative voltage and current per rail
- `powernet/device/powerail/{N}/info` — per-rail system voltages (`VSensor`, `VSys`) and board temperature (`tempReg`)

## 1.0.2

### Added
- Per-topic-group subscription toggles in the plugin config UI — users can enable or disable each of the seven topic groups (batteries, tanks, actions, breakers, hub, powernet, ui_config) independently
- `ui_config` topic group is disabled by default to reduce noise on first install
- Plugin surfaces a clear status message if all topic groups are disabled
- Live-data filter (`isLiveData`) that drops metadata, config blobs, multilingual labels, command templates, and field ID mappings before publishing — reduces published paths from ~10,000 to ~230

## 1.0.0

### Added
- Initial release as a Signal K plugin
- Connects to a SailSense Hub via MQTT with configurable broker host and port
- Subscribes to all SailSense topics: `batteries/#`, `tanks/#`, `actions/#`, `breakers/#`, `Hub/#`, `powernet/#`, `ui_config/#`
- Forwards all MQTT messages to Signal K under a `sailsense.*` path namespace
- Automatic type coercion: boolean strings, numeric strings, and JSON blobs are parsed to native types
- Connection status reported to Signal K via `setPluginStatus` and `setPluginError`
- Graceful reconnection with configurable retry interval
