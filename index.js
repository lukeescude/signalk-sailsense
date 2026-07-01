const mqtt = require('mqtt');

// Maps settings keys to MQTT wildcard topics
const TOPIC_MAP = {
  batteries: 'batteries/#',
  tanks:     'tanks/#',
  actions:   'actions/#',
  breakers:  'breakers/#',
  hub:       'Hub/#',
  powernet:  'powernet/#',
  shortcuts: 'contents/action_shortcut/#',
  ui_config: 'ui_config/#',
};

// Returns true if this MQTT topic carries live sensor data worth publishing.
// Filters out metadata, config blobs, labels, translations, and other static noise.
function isLiveData(topic) {
  // Hub: only three topics carry useful live data
  if (topic.startsWith('Hub/')) {
    return topic === 'Hub/wifi' ||
           topic === 'Hub/zigbee/bridge/state' ||
           topic === 'Hub/telematic/signalprocessed/rx';
  }

  // Powernet: voltmeter and input blobs, output settings blobs, and per-rail info/hull
  if (topic.startsWith('powernet/')) {
    return /\/voltmeters\/\d+$/.test(topic) ||
           /\/inputs\/\d+$/.test(topic) ||
           /\/outputs\/\d+\/settings$/.test(topic) ||
           /\/powerail\/\d+\/hull$/.test(topic) ||
           /\/powerail\/\d+\/info$/.test(topic);
  }

  // Drop internal hardware register mappings — not useful to any SK consumer
  if (topic.includes('/field_id_mapping/')) return false;

  // All other groups: only forward recognised live-data leaf fields
  return [
    '/state', '/actionInProgress', '/dimmer_step',
    '/voltage', '/current', '/percentage', '/remaining',
    '/alert',
    '/levels/%', '/levels/L', '/levels/gal', '/levels/US gal',
  ].some(suffix => topic.endsWith(suffix));
}

// Convert an MQTT topic to a Signal K path under the sailsense.* namespace.
// Strips structural 'children' segments and sanitizes special characters.
// e.g. "batteries/children/Main/children/Bank1/voltage" → "sailsense.batteries.Main.Bank1.voltage"
function topicToPath(topic) {
  return 'sailsense.' + topic
    .split('/')
    .filter(seg => seg !== 'children')
    .map(seg => seg.replace(/%/g, 'pct').replace(/[^a-zA-Z0-9_-]/g, '_'))
    .join('.');
}

// Coerce MQTT string payloads to native types; parse JSON blobs if possible.
function coerce(str) {
  if (str === 'True') return true;
  if (str === 'False') return false;
  if (str.trim() !== '' && !isNaN(str)) return Number(str);
  try { return JSON.parse(str); } catch { return str; }
}

// Hardware address lookup for each breaker — used by the put handler to build
// the MQTT command payload required by the SailSense Hub.
const BREAKER_MAP = {
  Cockpit_fridge:           { name: 'Cockpit fridge',           outputs: [{ nPow: 1, output: 23 }] },
  Electronic:               { name: 'Electronic',               outputs: [{ nPow: 1, output: 22 }] },
  Fans:                     { name: 'Fans',                     outputs: [{ nPow: 1, output: 13 }, { nPow: 2, output: 11 }] },
  Fresh_water_rinsing_pump: { name: 'Fresh water rinsing pump', outputs: [{ nPow: 2, output: 23 }] },
  Front_Galley_Freezer:     { name: 'Front Galley Freezer',     outputs: [{ nPow: 1, output: 19 }] },
  Front_Galley_Fridge:      { name: 'Front Galley Fridge',      outputs: [{ nPow: 2, output: 21 }] },
  Galley_cool_box:          { name: 'Galley cool box',          outputs: [{ nPow: 2, output: 18 }] },
  Galley_sea_water_pump:    { name: 'Galley sea water pump',    outputs: [{ nPow: 2, output: 13 }] },
  HIFI:                     { name: 'HIFI',                     outputs: [{ nPow: 1, output: 17 }] },
  Nav_table_screen_Nep_2:   { name: 'Nav table screen Nep 2',   outputs: [{ nPow: 1, output:  2 }] },
  'Oven_-_plate_inverter':  { name: 'Oven - plate inverter',    outputs: [{ nPow: 2, output: 17 }] },
  Sea_water_rinsing_pump:   { name: 'Sea water rinsing pump',   outputs: [{ nPow: 2, output: 24 }] },
  STBD_front_cabin_fridge:  { name: 'STBD front cabin fridge',  outputs: [{ nPow: 2, output: 22 }] },
  TAC_reading_lights:       { name: 'TAC reading lights',       outputs: [{ nPow: 1, output: 12 }] },
  TV_amplifier:             { name: 'TV amplifier',             outputs: [{ nPow: 1, output: 21 }] },
};

// Hardware address lookup for lights/pumps, namespaced by Signal K action group (mirrors
// BREAKER_MAP). Keys are toKey()'d names exactly as the webapp builds them, e.g.
// sailsense.actions.port_lights.reading_light.state — see DEVICES.md for the source tables.
const ACTION_MAP = {
  exterior_light: {
    Submarine_light:         { name: 'Submarine light',         outputs: [{ nPow: 1, output: 1 }] },
    Foredeck_courtesy_light: { name: 'Foredeck courtesy light', outputs: [{ nPow: 1, output: 3 }, { nPow: 2, output: 3 }] },
    Under_bridge_deck_light: { name: 'Under bridge deck light', outputs: [{ nPow: 1, output: 14 }] },
    Cockpit_courtesy_light:  { name: 'Cockpit courtesy light',  outputs: [{ nPow: 2, output: 4 }] },
    Spreader_light:          { name: 'Spreader light',          outputs: [{ nPow: 2, output: 10 }] },
  },
  nacelle_lights: {
    Saloon_light:          { name: 'Saloon light',          outputs: [{ nPow: 1, output: 11 }] },
    Saloon_indirect_light: { name: 'Saloon indirect light', outputs: [{ nPow: 1, output: 18 }] },
    Cockpit_light:         { name: 'Cockpit light',         outputs: [{ nPow: 1, output: 10 }] },
  },
  port_lights: {
    reading_light:     { name: 'reading light',     outputs: [{ nPow: 1, output: 5 }] },
    rear_cabin_light:  { name: 'rear cabin light',  outputs: [{ nPow: 1, output: 6 }] },
    corridor_light:    { name: 'corridor light',    outputs: [{ nPow: 1, output: 8 }] },
    front_cabin_light: { name: 'front cabin light', outputs: [{ nPow: 1, output: 9 }] },
  },
  stbd_lights: {
    reading_light:     { name: 'reading light',     outputs: [{ nPow: 2, output: 5 }] },
    rear_cabin_light:  { name: 'rear cabin light',  outputs: [{ nPow: 2, output: 7 }] },
    corridor_light:    { name: 'corridor light',    outputs: [{ nPow: 2, output: 8 }] },
    front_cabin_light: { name: 'front cabin light', outputs: [{ nPow: 2, output: 9 }] },
  },
  bilge_pumps: {
    Port_engine_bilge_pump: { name: 'Port engine bilge pump', outputs: [{ nPow: 1, output: 15 }] },
    Port_hull_bilge_pump:   { name: 'Port hull bilge pump',   outputs: [{ nPow: 1, output: 16 }] },
    STBD_engine_bilge_pump: { name: 'STBD engine bilge pump', outputs: [{ nPow: 2, output: 14 }] },
    STBD_hull_bilge_pump:   { name: 'STBD hull bilge pump',   outputs: [{ nPow: 2, output: 15 }] },
  },
  water_pump: {
    Fresh_water_pump:     { name: 'Fresh water pump',     outputs: [{ nPow: 1, output: 24 }] },
    Port_grey_water_pump: { name: 'Port grey water pump', outputs: [{ nPow: 1, output: 20 }] },
    STBD_grey_water_pump: { name: 'STBD grey water pump', outputs: [{ nPow: 2, output: 20 }] },
  },
};

// Action groups whose lights support a 6-step dimmer (step 0-5 → brightness
// [15, 25, 35, 45, 55, 100] %) in addition to plain on/off. See DEVICES.md "Dimmable Lights".
const DIMMABLE_GROUPS = ['nacelle_lights'];

// Exported for testing
module.exports = function(app) {
  let client = null;
  let activeClientId = null;
  let hubHostname = null;
  let dashboardConfig = { hiddenBreakers: [] };

  // Registered once in the factory so the route survives plugin stop/start cycles.
  app.get('/signalk-sailsense/config', function(req, res) {
    res.json(dashboardConfig);
  });

  const plugin = {
    id: 'signalk-sailsense',
    name: 'SailSense Hub',
    description: 'Connects to a SailSense Hub via MQTT and publishes raw sensor data to Signal K',

    schema: {
      type: 'object',
      required: ['mqttHost'],
      properties: {
        mqttHost: {
          type: 'string',
          title: 'MQTT Broker Host',
          description: 'IP address or hostname of the SailSense Hub',
          default: '192.168.50.231'
        },
        mqttPort: {
          type: 'number',
          title: 'MQTT Broker Port',
          default: 1883
        },
        hiddenBreakers: {
          type: 'array',
          title: 'Hidden Breakers',
          description: 'Breakers to hide in the dashboard — leave empty to show all',
          uniqueItems: true,
          default: [],
          items: {
            type: 'string',
            enum: [
              'Cockpit fridge', 'Electronic', 'Fans', 'Fresh water rinsing pump',
              'Front Galley Freezer', 'Front Galley Fridge', 'Galley cool box',
              'Galley sea water pump', 'HIFI', 'Nav table screen Nep 2',
              'Oven - plate inverter', 'Sea water rinsing pump',
              'STBD front cabin fridge', 'TAC reading lights', 'TV amplifier',
            ]
          }
        },
        topics: {
          type: 'object',
          title: 'Subscribed Topics',
          description: 'Choose which topic groups to subscribe to',
          default: {},
          properties: {
            batteries: { type: 'boolean', title: 'Batteries — voltage, current, charge level, alerts',     default: true  },
            tanks:     { type: 'boolean', title: 'Tanks — fuel, fresh water, blackwater levels and alerts', default: true  },
            actions:   { type: 'boolean', title: 'Actions — lights, pumps, and switch states',             default: true  },
            breakers:  { type: 'boolean', title: 'Breakers — circuit breaker on/off states',               default: true  },
            hub:       { type: 'boolean', title: 'Hub — GPS, wind, depth, IMU, Wi-Fi, Zigbee',            default: true  },
            powernet:  { type: 'boolean', title: 'Powernet — power rail voltmeters, inputs, outputs',     default: true  },
            shortcuts: { type: 'boolean', title: 'Shortcuts — anchor, engine, navigation, and deck lights', default: true  },
            ui_config: { type: 'boolean', title: 'UI Config — Hub interface configuration blobs',          default: false },
          }
        }
      }
    },

    start(settings) {
      dashboardConfig = {
        hiddenBreakers: Array.isArray(settings.hiddenBreakers) ? settings.hiddenBreakers : [],
        breakerOutputs: Object.fromEntries(
          Object.entries(BREAKER_MAP).map(([key, val]) => [key, val.outputs])
        ),
      };
      const { mqttHost = '192.168.50.231', mqttPort = 1883, topics = {} } = settings;

      // Build the active topic list; default to enabled for all except ui_config
      const activeTopics = Object.entries(TOPIC_MAP)
        .filter(([key]) => topics[key] !== false && !(key === 'ui_config' && topics[key] == null))
        .map(([, topic]) => topic);

      if (activeTopics.length === 0) {
        app.setPluginStatus('No topics selected — nothing to subscribe to');
        return;
      }

      activeClientId = 'signalk-sailsense-' + Math.random().toString(16).slice(2, 10);

      // Shared by breaker and action (light/pump) put handlers — builds the {nPow, output}
      // or multi-output {children} command payload and publishes it to the Hub.
      const publishToggle = (entry, mqttTopic, value, done) => {
        if (!client) return done({ state: 'COMPLETED' });
        const cmdState = value ? 'on' : 'off';
        let payload;
        if (entry.outputs.length === 1) {
          payload = { nPow: entry.outputs[0].nPow, output: entry.outputs[0].output, state: cmdState, topic: mqttTopic };
        } else {
          payload = { children: entry.outputs.map(o => ({ nPow: o.nPow, output: o.output })), state: cmdState, topic: mqttTopic };
        }
        if (!hubHostname) return done({ state: 'COMPLETED' });
        client.publish(`cmd/${hubHostname}/send`, JSON.stringify(payload), { qos: 1, retain: false });
        done({ state: 'COMPLETED' });
      };

      if (typeof app.registerPutHandler === 'function') {
        Object.keys(BREAKER_MAP).forEach(key => {
          const breaker = BREAKER_MAP[key];
          const mqttTopic = `breakers/children/${breaker.name}/children/${breaker.name}`;
          app.registerPutHandler('vessels.self', `sailsense.breakers.${key}.state`,
            (ctx, path, value, done) => publishToggle(breaker, mqttTopic, value, done)
          );
        });

        Object.entries(ACTION_MAP).forEach(([group, actions]) => {
          Object.keys(actions).forEach(key => {
            const action = actions[key];
            const mqttTopic = `actions/children/${group}/children/${action.name}`;
            app.registerPutHandler('vessels.self', `sailsense.actions.${group}.${key}.state`,
              (ctx, path, value, done) => publishToggle(action, mqttTopic, value, done)
            );
          });
        });

        DIMMABLE_GROUPS.forEach(group => {
          Object.keys(ACTION_MAP[group]).forEach(key => {
            const action = ACTION_MAP[group][key];
            const mqttTopic = `actions/children/${group}/children/${action.name}`;
            app.registerPutHandler('vessels.self', `sailsense.actions.${group}.${key}.dimmer_step`,
              (ctx, path, value, done) => {
                if (!client) return done({ state: 'COMPLETED' });
                // `value` here is our UI's 0-based DIMMER_STEPS array index (0-5). The Hub's own
                // dimmer_step status topic (and, it appears, its command handler) uses a 1-based
                // "Level 1-6" convention instead — confirmed by comparing the retained
                // actions/.../dimmer_step value against the same light's
                // powernet/.../outputs/{n}/settings.value (the true 0-based dimmer_table index),
                // which are consistently offset by exactly 1. Translate here so the rest of the
                // app can keep using plain 0-based indices.
                const index = Math.max(0, Math.min(5, Math.round(Number(value))));
                const payload = { nPow: action.outputs[0].nPow, output: action.outputs[0].output, step: index + 1, topic: mqttTopic };
                if (!hubHostname) return done({ state: 'COMPLETED' });
                client.publish(`cmd/${hubHostname}/send`, JSON.stringify(payload), { qos: 1, retain: false });
                done({ state: 'COMPLETED' });
              }
            );
          });
        });
      }

      client = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`, {
        clientId: activeClientId,
        reconnectPeriod: 4000,
        connectTimeout: 4000,
      });

      client.on('connect', () => {
        app.setPluginStatus(`Connected to ${mqttHost}:${mqttPort}`);
        // about/hostname is retained — arrives immediately, gives us the Hub's command target
        client.subscribe(['about/hostname', ...activeTopics], (err) => {
          if (err) app.setPluginError(`Subscribe error: ${err.message}`);
        });
      });

      client.on('message', (topic, payload) => {
        if (topic === 'about/hostname') {
          hubHostname = payload.toString().trim();
          return;
        }
        if (!isLiveData(topic)) return;

        const value = coerce(payload.toString());
        const path = topicToPath(topic);

        app.handleMessage(plugin.id, {
          updates: [{
            values: [{ path, value }]
          }]
        });
      });

      client.on('error',     (err) => app.setPluginError(err.message));
      client.on('offline',   ()    => app.setPluginStatus('Disconnected — waiting to reconnect'));
      client.on('reconnect', ()    => app.setPluginStatus(`Reconnecting to ${mqttHost}:${mqttPort}...`));
    },

    stop() {
      if (client) {
        client.end();
        client = null;
      }
      activeClientId = null;
      hubHostname = null;
    }
  };

  return plugin;
};

module.exports.isLiveData  = isLiveData;
module.exports.topicToPath = topicToPath;
module.exports.coerce      = coerce;
