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
| `breakers/children/HIFI/children/HIFI/state` | `sailsense.breakers.HIFI.HIFI.state` |
| `powernet/device/powerail/1/voltmeters/1/value` | `sailsense.powernet.device.powerail.1.voltmeters.1.value` |

String payloads are coerced to native types: `"True"`/`"False"` become booleans, numeric strings become numbers, and JSON blobs are parsed into objects.

## Subscribed topics

- `batteries/#` — battery voltage, current, percentage, remaining capacity, alerts
- `tanks/#` — tank levels (%, L, US gal) and alerts
- `actions/#` — switch/light states and dimmer steps
- `breakers/#` — breaker on/off states
- `Hub/#` — GPS, wind, depth, IMU, Wi-Fi, Zigbee, and telematic data
- `powernet/#` — power rail voltmeters, analog inputs, and output states
- `ui_config/#` — Hub UI configuration blobs

## Hardware reference

See [DEVICES.md](./DEVICES.md) for a full map of breakers, lights, pumps, tanks, and Powerail outputs specific to the SailSense system.

## License

MIT
