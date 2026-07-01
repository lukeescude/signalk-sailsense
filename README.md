# signalk-sailsense

A Signal K plugin that connects to a [SailSense Hub](https://www.sailsense.io) over MQTT and publishes all sensor data as raw Signal K values.

## What it does

The SailSense Hub exposes boat data — batteries, tanks, breakers, actions, GPS, wind, depth, and power rail telemetry — over a local MQTT broker. This plugin subscribes to all of those topics and forwards every value into Signal K under a `sailsense.*` path namespace, making the data available to any Signal K instrument, logger, or automation.

## Installation

Install from the Signal K AppStore inside the Signal K server UI, or via npm:

```bash
npm install signalk-sailsense
```

Then restart your Signal K server and enable the plugin under **Server → Plugin Config → SailSense Hub**.
 
## Configuration

| Field | Default | Description |
|---|---|---|
| MQTT Broker Host | `192.168.50.231` | IP address or hostname of the SailSense Hub on your local network |
| MQTT Broker Port | `1883` | MQTT port (standard; change only if you've customised the Hub) |

### Topic groups

Each topic group can be toggled independently in the plugin config UI to reduce noise:

| Group | Default | Covers |
|---|---|---|
| Batteries | enabled | Voltage, current, charge level, alerts |
| Tanks | enabled | Fuel, fresh water, blackwater levels and alerts |
| Actions | enabled | Lights, pumps, and switch states |
| Breakers | enabled | Circuit breaker on/off states |
| Hub | enabled | GPS, wind, depth, IMU, Wi-Fi, Zigbee |
| Powernet | enabled | Power rail voltmeters, analog inputs, output states |
| UI Config | **disabled** | Hub interface configuration blobs (high-volume, low-value) |

## Signal K paths

MQTT topics are mapped to Signal K paths by:

1. Stripping structural `children` segments
2. Replacing `/` with `.`
3. Prefixing with `sailsense.`

Some examples:

| MQTT topic | Signal K path |
|---|---|
| `batteries/children/Main/children/Bank1/voltage` | `sailsense.batteries.Main.Bank1.voltage` |
| `tanks/children/water_tanks/children/water_tank_portside/levels/pct` | `sailsense.tanks.water_tanks.water_tank_portside.levels.pct` |
| `Hub/telematic/signalprocessed/rx` | `sailsense.Hub.telematic.signalprocessed.rx` |
| `breakers/children/HIFI/state` | `sailsense.breakers.HIFI.state` |
| `powernet/device/powerail/1/voltmeters/1/value` | `sailsense.powernet.device.powerail.1.voltmeters.1.value` |

> **Note on breaker paths:** the hub also publishes a deeper path `breakers/children/HIFI/children/HIFI/state`, but that is a retained MQTT message that does not update with live state. Always read from `sailsense.breakers.{Name}.state`.

String payloads are coerced to native types: `"True"`/`"False"` become booleans, numeric strings become numbers, and JSON blobs are parsed into objects.

## Subscribed topics

- `batteries/#` — battery voltage, current, percentage, remaining capacity, alerts
- `tanks/#` — tank levels (%, L, US gal) and alerts
- `actions/#` — switch/light states and dimmer steps
- `breakers/#` — breaker on/off states
- `Hub/#` — GPS, wind, depth, IMU, Wi-Fi, Zigbee, and telematic data
- `powernet/#` — power rail voltmeters, analog inputs, and output states
- `ui_config/#` — Hub UI configuration blobs

## Dashboard

This package includes a built-in web dashboard, served by Signal K at:

```
http://<signalk-host>/signalk-sailsense/
```

The dashboard has four tabs:

| Tab | Shows |
|---|---|
| **Power** | Battery bank voltage, current, and state of charge (dynamically discovered) |
| **Tanks** | PORT/STBD fill gauges for fresh water, fuel, and blackwater with litre readouts |
| **Breakers** | All 15 circuit breakers with live on/off indicators |
| **Lights & Pumps** | Nacelle, exterior, and cabin light states; bilge and water pump states |

Data updates in real time via WebSocket with a 3-second REST polling fallback. No installation or build step required — it is a single HTML file bundled with the plugin.

Tabs can be deep-linked via URL hash: `#power`, `#tanks`, `#breakers`, `#lights`.

### Browser compatibility

The dashboard is compatible with **Chrome 70+**, including the embedded Chromium browser on B&G Zeus 3 and similar Navico MFDs. No polyfills are required — the code avoids all JS and CSS features introduced after Chrome 70.

### Authentication on MFDs

MFDs have no Signal K session cookie, so if Signal K has authentication enabled and **Allow Read-Only Access** is disabled, the dashboard will display an error rather than silently showing empty panels.

Two ways to fix this:

- **Simplest:** in Signal K admin go to **Security** and enable **Allow Read-Only Access**. This allows unauthenticated reads on a private boat LAN.
- **Token-based:** configure a JWT token in the [signalk-navico-embedder](https://github.com/lukeescude/signalk-navico-embedder) plugin. The embedder injects the token into every proxied request and into the page as `window.SK_TOKEN`, which the dashboard picks up automatically.

## Hardware reference

See [DEVICES.md](./DEVICES.md) for a full map of breakers, lights, pumps, tanks, and Powerail outputs specific to the SailSense system.

## License

MIT

## Luke's development cheatsheet
```aiignore
npm link /Users/lukeescude/Code/signalk-navico-embedder /Users/lukeescude/Code/signalk-sailsense && signalk-server
```