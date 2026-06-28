# Sailsense Device Reference

All control commands are published to `cmd/{clientId}/send` as JSON with `state` (`"on"`/`"off"`) or `step` (dimmer index) added to the payload. Retained state for each device is available on the corresponding MQTT topic.

---

## Dimmable Lights

Controlled via `dimLight(name, step)` or `toggleLight(name, state)`.  
Step index maps into the brightness table `[15, 25, 35, 45, 55, 100]` (%).

| Name | Key | Rail | Output | MQTT Topic |
|---|---|---|---|---|
| Saloon light | `saloon` | 1 | 11 | `actions/children/nacelle_lights/children/Saloon light` |
| Saloon indirect light | `saloon indirect` | 1 | 18 | `actions/children/nacelle_lights/children/Saloon indirect light` |
| Cockpit light | `cockpit` | 1 | 10 | `actions/children/nacelle_lights/children/Cockpit light` |

**Dimmer steps:**

| Step | Brightness |
|---|---|
| 0 | 15% |
| 1 | 25% |
| 2 | 35% |
| 3 | 45% |
| 4 | 55% |
| 5 | 100% |

---

## Toggle Lights

Controlled via `toggleLight(name, state)` or a raw `cmd/{clientId}/send` publish.

### Exterior Lights

| Name | Rail | Output | MQTT Topic |
|---|---|---|---|
| Submarine light | 1 | 1 | `actions/children/exterior_light/children/Submarine light` |
| Foredeck courtesy light | 1+2 | 3+3 | `actions/children/exterior_light/children/Foredeck courtesy light` |
| Under bridge deck light | 1 | 14 | `actions/children/exterior_light/children/Under bridge deck light` |
| Cockpit courtesy light | 2 | 4 | `actions/children/exterior_light/children/Cockpit courtesy light` |
| Spreader light | 2 | 10 | `actions/children/exterior_light/children/Spreader light` |

### Port Cabin Lights

| Name | Rail | Output | MQTT Topic |
|---|---|---|---|
| Port reading light | 1 | 5 | `actions/children/port_lights/children/reading light` |
| Port rear cabin light | 1 | 6 | `actions/children/port_lights/children/rear cabin light` |
| Port corridor light | 1 | 8 | `actions/children/port_lights/children/corridor light` |
| Port front cabin light | 1 | 9 | `actions/children/port_lights/children/front cabin light` |

### Starboard Cabin Lights

| Name | Rail | Output | MQTT Topic |
|---|---|---|---|
| STBD reading light | 2 | 5 | `actions/children/stbd_lights/children/reading light` |
| STBD rear cabin light | 2 | 7 | `actions/children/stbd_lights/children/rear cabin light` |
| STBD corridor light | 2 | 8 | `actions/children/stbd_lights/children/corridor light` |
| STBD front cabin light | 2 | 9 | `actions/children/stbd_lights/children/front cabin light` |

---

## Pumps & Other Actions

Controlled via `toggleLight(name, state)` or a raw `cmd/{clientId}/send` publish (same command format as lights).

### Bilge Pumps

| Name | Rail | Output | MQTT Topic |
|---|---|---|---|
| Port engine bilge pump | 1 | 15 | `actions/children/bilge_pumps/children/Port engine bilge pump` |
| Port hull bilge pump | 1 | 16 | `actions/children/bilge_pumps/children/Port hull bilge pump` |
| STBD engine bilge pump | 2 | 14 | `actions/children/bilge_pumps/children/STBD engine bilge pump` |
| STBD hull bilge pump | 2 | 15 | `actions/children/bilge_pumps/children/STBD hull bilge pump` |

### Water Pumps

| Name | Rail | Output | MQTT Topic |
|---|---|---|---|
| Fresh water pump | 1 | 24 | `actions/children/water_pump/children/Fresh water pump` |
| Port grey water pump | 1 | 20 | `actions/children/water_pump/children/Port grey water pump` |
| STBD grey water pump | 2 | 20 | `actions/children/water_pump/children/STBD grey water pump` |

---

## Breakers

Controlled via `toggleBreaker(name, state)`.

| Name | Key | Rail(s) | Output(s) | MQTT State Topic |
|---|---|---|---|---|
| Cockpit fridge | `cockpit fridge` | 1 | 23 | `breakers/children/Cockpit fridge/children/Cockpit fridge/state` |
| Electronic | `electronic` | 1 | 22 | `breakers/children/Electronic/children/Electronic/state` |
| Fans | `fans` | 1+2 | 13+11 | `breakers/children/Fans/children/Fans/state` |
| Fresh water rinsing pump | `fresh water rinsing pump` | 2 | 23 | `breakers/children/Fresh water rinsing pump/children/Fresh water rinsing pump/state` |
| Front Galley Freezer | `front galley freezer` | 1 | 19 | `breakers/children/Front Galley Freezer/children/Front Galley Freezer/state` |
| Front Galley Fridge | `front galley fridge` | 2 | 21 | `breakers/children/Front Galley Fridge/children/Front Galley Fridge/state` |
| Galley cool box | `galley cool box` | 2 | 18 | `breakers/children/Galley cool box/children/Galley cool box/state` |
| Galley sea water pump | `galley sea water pump` | 2 | 13 | `breakers/children/Galley sea water pump/children/Galley sea water pump/state` |
| HIFI | `hifi` | 1 | 17 | `breakers/children/HIFI/children/HIFI/state` |
| Nav table screen Nep 2 | `nav table screen nep 2` | 1 | 2 | `breakers/children/Nav table screen Nep 2/children/Nav table screen Nep 2/state` |
| Oven / plate inverter | `oven - plate inverter` | 2 | 17 | `breakers/children/Oven - plate inverter/children/Oven - plate inverter/state` |
| Sea water rinsing pump | `sea water rinsing pump` | 2 | 24 | `breakers/children/Sea water rinsing pump/children/Sea water rinsing pump/state` |
| STBD front cabin fridge | `stbd front cabin fridge` | 2 | 22 | `breakers/children/STBD front cabin fridge/children/STBD front cabin fridge/state` |
| TAC reading lights | `tac reading lights` | 1 | 12 | `breakers/children/TAC reading lights/children/TAC reading lights/state` |
| TV amplifier | `tv amplifier` | 1 | 21 | `breakers/children/TV amplifier/children/TV amplifier/state` |

> **Fans** controls two outputs simultaneously (rail 1 out 13 + rail 2 out 11). The system handles this automatically via the `children` array in the command payload.

---

## Powernet Inputs

Raw analog sensor readings. Published to `powernet/device/powerail/{rail}/inputs/{n}/value`.  
Values are ADC counts (0–255 scale) converted to engineering units by the tank/battery calibration.

| Rail | Input | Mapped To | Live Topic |
|---|---|---|---|
| 1 | 1 | — (unused / ~0V) | `powernet/device/powerail/1/inputs/1/value` |
| 1 | 2 | — | `powernet/device/powerail/1/inputs/2/value` |
| 1 | 3 | Gasoil tank PORT sensor | `powernet/device/powerail/1/inputs/3/value` |
| 1 | 4 | Water tank PORT sensor | `powernet/device/powerail/1/inputs/4/value` |
| 1 | 5 | Blackwater tank PORT sensor | `powernet/device/powerail/1/inputs/5/value` |
| 1 | 6 | — (unused / ~0V) | `powernet/device/powerail/1/inputs/6/value` |
| 1 | 7 | — (unused / ~0V) | `powernet/device/powerail/1/inputs/7/value` |
| 1 | 8 | — (unused / ~0V) | `powernet/device/powerail/1/inputs/8/value` |
| 2 | 1 | — (unused / ~0V) | `powernet/device/powerail/2/inputs/1/value` |
| 2 | 2 | — (unused / ~0V) | `powernet/device/powerail/2/inputs/2/value` |
| 2 | 3 | Gasoil tank STBD sensor | `powernet/device/powerail/2/inputs/3/value` |
| 2 | 4 | Water tank STBD sensor | `powernet/device/powerail/2/inputs/4/value` |
| 2 | 5 | Blackwater tank STBD sensor | `powernet/device/powerail/2/inputs/5/value` |
| 2 | 6 | — (unused / ~0V) | `powernet/device/powerail/2/inputs/6/value` |
| 2 | 7 | — (unused / ~0V) | `powernet/device/powerail/2/inputs/7/value` |
| 2 | 8 | — (unused / ~0V) | `powernet/device/powerail/2/inputs/8/value` |

Calibrated tank levels (%, L, US gal) are available on the higher-level topics under `tanks/#`.

---

## Powernet Outputs

Full output map for both Powerail units. Settings (state, current, temp, dimmer value) are published to `powernet/device/powerail/{rail}/outputs/{n}/settings`.

### Rail 1

| Output | Type | Mapped To |
|---|---|---|
| 1 | toggle | Submarine light |
| 2 | toggle | Nav table screen Nep 2 (breaker) |
| 3 | toggle | Foredeck courtesy light |
| 4 | toggle | Navigation light (shortcut) |
| 5 | toggle | Port reading light |
| 6 | toggle | Port rear cabin light |
| 7 | toggle | *(unmapped)* |
| 8 | toggle | Port corridor light |
| 9 | toggle | Port front cabin light |
| 10 | **dimmable** | Cockpit light |
| 11 | **dimmable** | Saloon light |
| 12 | toggle | TAC reading lights (breaker) |
| 13 | toggle | Fans (breaker) |
| 14 | toggle | Under bridge deck light |
| 15 | toggle | Port engine bilge pump |
| 16 | toggle | Port hull bilge pump |
| 17 | toggle | HIFI (breaker) |
| 18 | **dimmable** | Saloon indirect light |
| 19 | toggle | Front Galley Freezer (breaker) |
| 20 | toggle | Port grey water pump |
| 21 | toggle | TV amplifier (breaker) |
| 22 | toggle | Electronic (breaker) |
| 23 | toggle | Cockpit fridge (breaker) |
| 24 | toggle | Fresh water pump |

### Rail 2

| Output | Type | Mapped To |
|---|---|---|
| 1 | toggle | Anchor light (shortcut) |
| 2 | toggle | Engine light (shortcut) |
| 3 | toggle | Foredeck courtesy light |
| 4 | toggle | Cockpit courtesy light |
| 5 | toggle | STBD reading light |
| 6 | toggle | Navigation light (shortcut) |
| 7 | toggle | STBD rear cabin light |
| 8 | toggle | STBD corridor light |
| 9 | toggle | STBD front cabin light |
| 10 | toggle | Spreader light |
| 11 | toggle | Fans (breaker) |
| 12 | toggle | Deck light (shortcut) |
| 13 | toggle | Galley sea water pump (breaker) |
| 14 | toggle | STBD engine bilge pump |
| 15 | toggle | STBD hull bilge pump |
| 16 | toggle | *(unmapped)* |
| 17 | toggle | Oven / plate inverter (breaker) |
| 18 | toggle | Galley cool box (breaker) |
| 19 | toggle | *(unmapped)* |
| 20 | toggle | STBD grey water pump |
| 21 | toggle | Front Galley Fridge (breaker) |
| 22 | toggle | STBD front cabin fridge (breaker) |
| 23 | toggle | Fresh water rinsing pump (breaker) |
| 24 | toggle | Sea water rinsing pump (breaker) |

---

## Tanks

Tank levels are read-only — sensors feed into the Powerail analog inputs and are calibrated by the system. All values are published as retained messages and update continuously.

### Fresh Water Tanks — capacity: 285L each

| Tank | MQTT Topic (levels) | Input Sensor |
|---|---|---|
| PORT fresh water | `tanks/children/water_tanks/children/water_tank_portside/levels/` | Rail 1 Input 4 |
| STBD fresh water | `tanks/children/water_tanks/children/water_tank_starboard/levels/` | Rail 2 Input 4 |

### Diesel (Gasoil) Tanks — capacity: 276L each

| Tank | MQTT Topic (levels) | Input Sensor |
|---|---|---|
| PORT fuel | `tanks/children/gazoil_tanks/children/gazoil_tank_portside/levels/` | Rail 1 Input 3 |
| STBD fuel | `tanks/children/gazoil_tanks/children/gazoil_tank_starboard/levels/` | Rail 2 Input 3 |

### Blackwater (Sewage) Tanks — capacity: 63L each

| Tank | MQTT Topic (levels) | Input Sensor |
|---|---|---|
| PORT blackwater | `tanks/children/blackwater_tanks/children/blackwater_tank_portside/levels/` | Rail 1 Input 5 |
| STBD blackwater | `tanks/children/blackwater_tanks/children/blackwater_tank_starboard/levels/` | Rail 2 Input 5 |

Append a unit suffix to the levels topic to get the value you need:

| Suffix | Unit |
|---|---|
| `%` | Percentage full |
| `L` | Litres |
| `gal` | Imperial gallons |
| `US gal` | US gallons |

**Example:** `tanks/children/water_tanks/children/water_tank_portside/levels/%` → `88.77`

An alert topic is also published per tank at `.../alert` with value `normal` or an alert string when thresholds are exceeded.

---

## Command Reference

### Publish a command

```
Topic:   cmd/{clientId}/send
QoS:     1
Retain:  false
```

**Toggle on/off:**
```json
{ "nPow": 1, "output": 11, "state": "on", "topic": "actions/children/nacelle_lights/children/Saloon light" }
```

**Set dimmer (step 0–5):**
```json
{ "nPow": 1, "output": 11, "step": 3, "topic": "actions/children/nacelle_lights/children/Saloon light" }
```

**Multi-output (e.g. Fans):**
```json
{ "children": [{ "nPow": 1, "output": 13 }, { "nPow": 2, "output": 11 }], "state": "on", "topic": "breakers/children/Fans/children/Fans" }
```

### Helper functions (index.js exports)

```js
const { dimLight, toggleLight, toggleBreaker } = require('./index');

dimLight('saloon', 3)                    // 45% brightness
dimLight('saloon', 100)                  // 100% brightness (by percentage)
toggleLight('saloon', 'off')
toggleBreaker('hifi', 'on')
toggleBreaker('fans', 'off')
```
