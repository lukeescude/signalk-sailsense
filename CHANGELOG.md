# Changelog

## [1.0.4] - 2026-06-28

### Added
- `contents/action_shortcut` topics now pass the live-data filter — these carry the available actions (e.g. shortcut commands) for lights and other devices under `actions/#`

## [1.0.3] - 2026-06-28

### Fixed
- Powernet voltmeter and input filters now match the actual MQTT topic structure (blob at `voltmeters/{N}` and `inputs/{N}`) — previously the filter expected a `/value` sub-topic that does not exist, so no voltmeter or input data was reaching Signal K
- Powernet output settings filter now captures the `outputs/{N}/settings` blob rather than `settings/state`, `settings/current`, and `settings/temp` sub-topics that do not exist — output state, amperage, and temperature were previously silently dropped

### Added
- `powernet/device/powerail/{N}/hull` — bus bar positive/negative voltage and current per rail
- `powernet/device/powerail/{N}/info` — per-rail system voltages (`VSensor`, `VSys`) and board temperature (`tempReg`)

## [1.0.2] - 2026-06-28

### Added
- Per-topic-group subscription toggles in the plugin config UI — users can enable or disable each of the seven topic groups (batteries, tanks, actions, breakers, hub, powernet, ui_config) independently
- `ui_config` topic group is disabled by default to reduce noise on first install
- Plugin surfaces a clear status message if all topic groups are disabled
- Live-data filter (`isLiveData`) that drops metadata, config blobs, multilingual labels, command templates, and field ID mappings before publishing — reduces published paths from ~10,000 to ~230

## [1.0.0] - 2026-06-28

### Added
- Initial release as a Signal K plugin
- Connects to a SailSense Hub via MQTT with configurable broker host and port
- Subscribes to all SailSense topics: `batteries/#`, `tanks/#`, `actions/#`, `breakers/#`, `Hub/#`, `powernet/#`, `ui_config/#`
- Forwards all MQTT messages to Signal K under a `sailsense.*` path namespace
- Automatic type coercion: boolean strings, numeric strings, and JSON blobs are parsed to native types
- Connection status reported to Signal K via `setPluginStatus` and `setPluginError`
- Graceful reconnection with configurable retry interval
