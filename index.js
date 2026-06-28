const mqtt = require('mqtt');

const TOPICS = ['batteries/#', 'tanks/#', 'ui_config/#', 'actions/#', 'breakers/#', 'Hub/#', 'powernet/#'];

// ─── light registry ───────────────────────────────────────────────────────────
// cmd payload is from actions/.../cmd; dimmer_table is the valid brightness steps (%)
const LIGHTS = {
  'cockpit':         { nPow: 1, output: 10, topic: 'actions/children/nacelle_lights/children/Cockpit light',         dimmer_table: [15, 25, 35, 45, 55, 100] },
  'saloon':          { nPow: 1, output: 11, topic: 'actions/children/nacelle_lights/children/Saloon light',          dimmer_table: [15, 25, 35, 45, 55, 100] },
  'saloon indirect': { nPow: 1, output: 18, topic: 'actions/children/nacelle_lights/children/Saloon indirect light', dimmer_table: [15, 25, 35, 45, 55, 100] },
};

// ─── breaker registry ─────────────────────────────────────────────────────────
// cmd mirrors actions/.../cmd exactly. Multi-output breakers use a children array.
const BREAKERS = {
  'cockpit fridge':           { cmd: { nPow: 1, output: 23 },                                                          topic: 'breakers/children/Cockpit fridge/children/Cockpit fridge' },
  'electronic':               { cmd: { nPow: 1, output: 22 },                                                          topic: 'breakers/children/Electronic/children/Electronic' },
  'fans':                     { cmd: { children: [{ nPow: 1, output: 13 }, { nPow: 2, output: 11 }] },                 topic: 'breakers/children/Fans/children/Fans' },
  'fresh water rinsing pump': { cmd: { nPow: 2, output: 23 },                                                          topic: 'breakers/children/Fresh water rinsing pump/children/Fresh water rinsing pump' },
  'front galley freezer':     { cmd: { nPow: 1, output: 19 },                                                          topic: 'breakers/children/Front Galley Freezer/children/Front Galley Freezer' },
  'front galley fridge':      { cmd: { nPow: 2, output: 21 },                                                          topic: 'breakers/children/Front Galley Fridge/children/Front Galley Fridge' },
  'galley cool box':          { cmd: { nPow: 2, output: 18 },                                                          topic: 'breakers/children/Galley cool box/children/Galley cool box' },
  'galley sea water pump':    { cmd: { nPow: 2, output: 13 },                                                          topic: 'breakers/children/Galley sea water pump/children/Galley sea water pump' },
  'hifi':                     { cmd: { nPow: 1, output: 17 },                                                          topic: 'breakers/children/HIFI/children/HIFI' },
  'nav table screen nep 2':   { cmd: { nPow: 1, output: 2 },                                                           topic: 'breakers/children/Nav table screen Nep 2/children/Nav table screen Nep 2' },
  'oven - plate inverter':    { cmd: { nPow: 2, output: 17 },                                                          topic: 'breakers/children/Oven - plate inverter/children/Oven - plate inverter' },
  'sea water rinsing pump':   { cmd: { nPow: 2, output: 24 },                                                          topic: 'breakers/children/Sea water rinsing pump/children/Sea water rinsing pump' },
  'stbd front cabin fridge':  { cmd: { nPow: 2, output: 22 },                                                          topic: 'breakers/children/STBD front cabin fridge/children/STBD front cabin fridge' },
  'tac reading lights':       { cmd: { nPow: 1, output: 12 },                                                          topic: 'breakers/children/TAC reading lights/children/TAC reading lights' },
  'tv amplifier':             { cmd: { nPow: 1, output: 21 },                                                          topic: 'breakers/children/TV amplifier/children/TV amplifier' },
};

const state = {
  batteries: {},   // [group][name] = { voltage, current, percentage, remaining, alert }
  tanks: {},       // [group][name] = { 'levels/%', 'levels/L', alert }
  actions: {},     // [group][name] = { state, actionInProgress }
  breakers: {},    // [name] = { state, outputs: { [child]: state } }
  hub: {
    wifi: null,
    zigbee: null,
    telematic: {},  // lat, lon, sog, cog, windAngleDeg, windSpeedMs, depth, etc.
  },
  powernet: {},    // [railId] = { voltmeters, inputs, outputs }
  ui_config: {},   // [section] = parsed JSON blob
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function tryJSON(s) {
  try { return JSON.parse(s); } catch { return s; }
}

// Coerce MQTT string payloads to native types
function coerce(str) {
  if (str === 'True') return true;
  if (str === 'False') return false;
  if (str.trim() !== '' && !isNaN(str)) return Number(str);
  return str;
}

// Returns true if the value actually changed
function update(obj, key, val) {
  if (obj[key] === val) return false;
  obj[key] = val;
  return true;
}

function rad2deg(r) { return r * (180 / Math.PI); }
function ms2kt(ms) { return ms * 1.94384; }

// ─── handlers ────────────────────────────────────────────────────────────────

function handleBattery(parts, str) {
  // batteries/children/{group}/children/{name}/{field}
  if (parts[3] !== 'children') return;
  const [, , group, , name, ...fp] = parts;
  const field = fp.join('/');

  const LIVE = new Set(['voltage', 'current', 'percentage', 'remaining', 'alert']);
  if (!LIVE.has(field)) return;

  state.batteries[group] ??= {};
  state.batteries[group][name] ??= {};
  const val = coerce(str);
  if (!update(state.batteries[group][name], field, val)) return;

  if      (field === 'voltage')    console.log(`[battery] ${name} (${group}): ${val}V`);
  else if (field === 'percentage') console.log(`[battery] ${name} (${group}): ${val}%`);
  else if (field === 'current')    console.log(`[battery] ${name} (${group}): ${val}A`);
  else if (field === 'remaining')  console.log(`[battery] ${name} (${group}): ${val}Ah remaining`);
  else if (field === 'alert' && val !== 'normal')
    console.log(`[battery] ALERT ${name} (${group}): ${val}`);
}

function handleTank(parts, str) {
  // tanks/children/{group}/children/{name}/{field}
  if (parts[3] !== 'children') return;
  const [, , group, , name, ...fp] = parts;
  const field = fp.join('/');

  if (field !== 'alert' && !field.startsWith('levels/')) return;

  state.tanks[group] ??= {};
  state.tanks[group][name] ??= {};
  const val = coerce(str);
  if (!update(state.tanks[group][name], field, val)) return;

  if      (field === 'levels/%') console.log(`[tank] ${name} (${group}): ${Number(val).toFixed(1)}%`);
  else if (field === 'levels/L') console.log(`[tank] ${name} (${group}): ${val}L`);
  else if (field === 'alert' && val !== 'normal')
    console.log(`[tank] ALERT ${name} (${group}): ${val}`);
}

function handleAction(parts, str) {
  // actions/children/{group}/children/{name}/{field}
  if (parts[3] !== 'children') return;
  const [, , group, , name, ...fp] = parts;
  const field = fp.join('/');

  const LIVE = new Set(['state', 'actionInProgress', 'dimmer_step']);
  if (!LIVE.has(field)) return;

  state.actions[group] ??= {};
  state.actions[group][name] ??= {};
  const val = coerce(str);
  if (!update(state.actions[group][name], field, val)) return;

  if      (field === 'state')             console.log(`[action] ${name} (${group}): ${val}`);
  else if (field === 'actionInProgress' && val === true)
    console.log(`[action] ${name} (${group}): in progress`);
}

function handleHub(topic, parts, str) {
  if (topic === 'Hub/wifi') {
    const val = tryJSON(str);
    if (JSON.stringify(state.hub.wifi) === JSON.stringify(val)) return;
    state.hub.wifi = val;
    console.log(`[hub/wifi] ssid=${val.ssid}`);
    return;
  }

  if (topic === 'Hub/zigbee/bridge/state') {
    if (update(state.hub, 'zigbee', str))
      console.log(`[hub/zigbee] ${str}`);
    return;
  }

  // Hub/telematic/signalprocessed/rx — richest processed output
  if (parts[1] === 'telematic' && parts[2] === 'signalprocessed' && parts[3] === 'rx') {
    let data;
    try { data = JSON.parse(str); } catch { return; }

    // Data is keyed by device ID; take the first device
    const deviceData = data.values ? Object.values(data.values)[0] : null;
    if (!deviceData?.mapped) return;

    const m = deviceData.mapped;
    const raw = deviceData.raw ?? {};
    const tel = state.hub.telematic;

    // GPS
    const lat = m.latitude;
    const lon = m.longitude;
    const sog = m.sog_gps;          // knots
    const cog = raw.gps?.cog;       // degrees
    const sat = m.num_satellites_nmea ?? m.num_satellites_hub;
    if (lat !== tel.lat || lon !== tel.lon || sog !== tel.sog) {
      Object.assign(tel, { lat, lon, sog, cog, sat });
      console.log(`[hub/gps] lat=${lat?.toFixed(5)}, lon=${lon?.toFixed(5)}, sog=${sog?.toFixed(2)}kt, cog=${cog?.toFixed(1)}°, sat=${sat}`);
    }

    // Wind (apparent)
    const windAngleDeg  = m.wind_angle  != null ? rad2deg(m.wind_angle)  : null;
    const windSpeedKnots = m.wind_speed != null ? ms2kt(m.wind_speed)    : null;
    if (windAngleDeg !== tel.windAngleDeg || windSpeedKnots !== tel.windSpeedKnots) {
      tel.windAngleDeg   = windAngleDeg;
      tel.windSpeedKnots = windSpeedKnots;
      console.log(`[hub/wind] apparent angle=${windAngleDeg?.toFixed(1)}°, speed=${windSpeedKnots?.toFixed(1)}kt`);
    }

    // Depth
    if (m.depth !== tel.depth) {
      tel.depth = m.depth;
      console.log(`[hub/depth] ${m.depth?.toFixed(2)}m`);
    }

    // Internal voltages & current from hub hardware
    const vin_bat = raw.vin_bat;
    const current = raw.current;
    if (vin_bat !== tel.vin_bat || current !== tel.current) {
      tel.vin_bat  = vin_bat;
      tel.current  = current;
      console.log(`[hub/power] vin_bat=${vin_bat}V, current=${current}A`);
    }

    // IMU (log once on change only — these update constantly)
    if (raw.imu && JSON.stringify(raw.imu) !== JSON.stringify(tel.imu)) {
      tel.imu = raw.imu;
      const i = raw.imu;
      console.log(`[hub/imu] yaw=${i.yaw_med}, pitch=${i.pitch_med}, roll=${i.roll_med}`);
    }
  }
}

function handlePowernet(parts, str) {
  // powernet/device/powerail/{id}/{component}/...
  if (parts[2] !== 'powerail') return;
  const railId = parts[3];
  state.powernet[railId] ??= { voltmeters: {}, inputs: {}, outputs: {}, hull: null, info: null };
  const rail = state.powernet[railId];

  if (parts[4] === 'voltmeters' && parts[6] === 'value') {
    const val = coerce(str);
    if (!update(rail.voltmeters, parts[5], val)) return;
    console.log(`[powernet/rail${railId}/voltmeter${parts[5]}] ${val}V`);
    return;
  }

  if (parts[4] === 'inputs' && parts[6] === 'value') {
    const val = coerce(str);
    if (!update(rail.inputs, parts[5], val)) return;
    console.log(`[powernet/rail${railId}/input${parts[5]}] ${val}`);
    return;
  }

  if (parts[4] === 'outputs' && parts[6] === 'settings' && parts[7] === 'state') {
    const val = coerce(str);
    if (!update(rail.outputs, parts[5], val)) return;
    console.log(`[powernet/rail${railId}/output${parts[5]}] ${val}`);
    return;
  }

  if (parts[4] === 'hull') {
    const val = tryJSON(str);
    if (JSON.stringify(rail.hull) === JSON.stringify(val)) return;
    rail.hull = val;
    console.log(`[powernet/rail${railId}/hull] updated`);
    return;
  }

  if (parts[4] === 'info') {
    const val = tryJSON(str);
    if (JSON.stringify(rail.info) === JSON.stringify(val)) return;
    rail.info = val;
    console.log(`[powernet/rail${railId}/info] updated`);
  }
}

function handleBreaker(parts, str) {
  // breakers/children/{name}/state  — group-level on/off
  // breakers/children/{name}/children/{child}/state  — individual output state
  if (parts[1] !== 'children') return;
  const name = parts[2];

  if (parts[3] === 'state' || parts[3] === 'actionInProgress') {
    state.breakers[name] ??= { state: null, outputs: {} };
    const val = coerce(str);
    if (!update(state.breakers[name], parts[3], val)) return;
    if (parts[3] === 'state') console.log(`[breaker] ${name}: ${val}`);
    return;
  }

  if (parts[3] === 'children' && parts[5] === 'state') {
    const child = parts[4];
    state.breakers[name] ??= { state: null, outputs: {} };
    const val = coerce(str);
    if (!update(state.breakers[name].outputs, child, val)) return;
    console.log(`[breaker] ${name} / ${child}: ${val}`);
  }
}

function handleUIConfig(parts, str) {
  const section = parts[1];
  if (!section) return;
  const val = tryJSON(str);
  if (JSON.stringify(state.ui_config[section]) === JSON.stringify(val)) return;
  state.ui_config[section] = val;
  console.log(`[ui_config] ${section} updated`);
}

// ─── MQTT client ─────────────────────────────────────────────────────────────

const clientId = 'sailsense-' + Math.random().toString(16).slice(2, 10);

const client = mqtt.connect('mqtt://192.168.50.231:1883', {
  clientId,
  reconnectPeriod: 4000,
  connectTimeout: 4000,
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe(TOPICS, (err) => {
    if (err) console.error('Subscribe error:', err.message);
    else console.log('Subscribed:', TOPICS.join(', '));
  });
});

client.on('message', (topic, payload) => {
  const str = payload.toString();
  const parts = topic.split('/');

  switch (parts[0]) {
    case 'batteries': return handleBattery(parts, str);
    case 'tanks':     return handleTank(parts, str);
    case 'actions':   return handleAction(parts, str);
    case 'breakers':  return handleBreaker(parts, str);
    case 'Hub':       return handleHub(topic, parts, str);
    case 'powernet':  return handlePowernet(parts, str);
    case 'ui_config': return handleUIConfig(parts, str);
  }
});

client.on('error',     (err) => console.error('MQTT error:', err.message));
client.on('reconnect', ()    => console.log('Reconnecting...'));
client.on('offline',   ()    => console.log('Client offline'));

// ─── light control ────────────────────────────────────────────────────────────

function resolveLight(name) {
  const light = LIGHTS[name.toLowerCase()];
  if (!light) throw new Error(`Unknown light "${name}". Available: ${Object.keys(LIGHTS).join(', ')}`);
  return light;
}

// Set brightness by step index (0–5) or percentage from dimmer_table.
// dimLight('saloon', 3)    → 45%
// dimLight('saloon', 100)  → 100% (matches a dimmer_table entry)
function dimLight(name, stepOrPct) {
  const light = resolveLight(name);
  let step = stepOrPct;

  // If value looks like a percentage, find the nearest dimmer_table index
  if (stepOrPct > 5) {
    const idx = light.dimmer_table.indexOf(stepOrPct);
    if (idx === -1) throw new Error(`${stepOrPct}% is not a valid step. Valid values: ${light.dimmer_table.join(', ')}`);
    step = idx;
  }

  if (step < 0 || step > light.dimmer_table.length - 1)
    throw new Error(`Step must be 0–${light.dimmer_table.length - 1}`);

  const cmd = { nPow: light.nPow, output: light.output, step, topic: light.topic };
  client.publish(`cmd/${clientId}/send`, JSON.stringify(cmd), { qos: 1, retain: false });
  // Keep the retained dimmer_step in sync so the web UI stays consistent
  client.publish(`${light.topic}/dimmer_step`, String(step), { qos: 1, retain: true });
  console.log(`[light] "${name}" → ${light.dimmer_table[step]}% (step ${step})`);
}

// Toggle a light on or off.
// toggleLight('saloon', 'on')
// toggleLight('saloon', 'off')
function toggleLight(name, onOrOff) {
  const light = resolveLight(name);
  if (onOrOff !== 'on' && onOrOff !== 'off')
    throw new Error('State must be "on" or "off"');

  const cmd = { nPow: light.nPow, output: light.output, state: onOrOff, topic: light.topic };
  client.publish(`cmd/${clientId}/send`, JSON.stringify(cmd), { qos: 1, retain: false });
  console.log(`[light] "${name}" → ${onOrOff}`);
}

// Toggle a breaker on or off.
// toggleBreaker('hifi', 'on')
// toggleBreaker('fans', 'off')
function toggleBreaker(name, onOrOff) {
  const breaker = BREAKERS[name.toLowerCase()];
  if (!breaker) throw new Error(`Unknown breaker "${name}". Available: ${Object.keys(BREAKERS).join(', ')}`);
  if (onOrOff !== 'on' && onOrOff !== 'off')
    throw new Error('State must be "on" or "off"');

  const cmd = { ...breaker.cmd, state: onOrOff, topic: breaker.topic };
  client.publish(`cmd/${clientId}/send`, JSON.stringify(cmd), { qos: 1, retain: false });
  console.log(`[breaker] "${name}" → ${onOrOff}`);
}

module.exports = { dimLight, toggleLight, toggleBreaker, state };