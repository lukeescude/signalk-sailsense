const mqtt = require('mqtt');

// Maps settings keys to MQTT wildcard topics
const TOPIC_MAP = {
  batteries: 'batteries/#',
  tanks:     'tanks/#',
  actions:   'actions/#',
  breakers:  'breakers/#',
  hub:       'Hub/#',
  powernet:  'powernet/#',
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

module.exports = function(app) {
  let client = null;

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
        topics: {
          type: 'object',
          title: 'Subscribed Topics',
          description: 'Choose which topic groups to subscribe to',
          properties: {
            batteries: { type: 'boolean', title: 'Batteries — voltage, current, charge level, alerts',     default: true  },
            tanks:     { type: 'boolean', title: 'Tanks — fuel, fresh water, blackwater levels and alerts', default: true  },
            actions:   { type: 'boolean', title: 'Actions — lights, pumps, and switch states',             default: true  },
            breakers:  { type: 'boolean', title: 'Breakers — circuit breaker on/off states',               default: true  },
            hub:       { type: 'boolean', title: 'Hub — GPS, wind, depth, IMU, Wi-Fi, Zigbee',            default: true  },
            powernet:  { type: 'boolean', title: 'Powernet — power rail voltmeters, inputs, outputs',     default: true  },
            ui_config: { type: 'boolean', title: 'UI Config — Hub interface configuration blobs',          default: false },
          }
        }
      }
    },

    start(settings) {
      const { mqttHost = '192.168.50.231', mqttPort = 1883, topics = {} } = settings;

      // Build the active topic list; default to enabled for all except ui_config
      const activeTopics = Object.entries(TOPIC_MAP)
        .filter(([key]) => topics[key] !== false && !(key === 'ui_config' && topics[key] == null))
        .map(([, topic]) => topic);

      if (activeTopics.length === 0) {
        app.setPluginStatus('No topics selected — nothing to subscribe to');
        return;
      }

      const clientId = 'signalk-sailsense-' + Math.random().toString(16).slice(2, 10);

      client = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`, {
        clientId,
        reconnectPeriod: 4000,
        connectTimeout: 4000,
      });

      client.on('connect', () => {
        app.setPluginStatus(`Connected to ${mqttHost}:${mqttPort}`);
        client.subscribe(activeTopics, (err) => {
          if (err) app.setPluginError(`Subscribe error: ${err.message}`);
        });
      });

      client.on('message', (topic, payload) => {
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
    }
  };

  return plugin;
};
