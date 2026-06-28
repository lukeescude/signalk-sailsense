const mqtt = require('mqtt');

const TOPICS = ['batteries/#', 'tanks/#', 'ui_config/#', 'actions/#', 'breakers/#', 'Hub/#', 'powernet/#'];

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
        }
      }
    },

    start(settings) {
      const { mqttHost = '192.168.50.231', mqttPort = 1883 } = settings;
      const clientId = 'signalk-sailsense-' + Math.random().toString(16).slice(2, 10);

      client = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`, {
        clientId,
        reconnectPeriod: 4000,
        connectTimeout: 4000,
      });

      client.on('connect', () => {
        app.setPluginStatus(`Connected to ${mqttHost}:${mqttPort}`);
        client.subscribe(TOPICS, (err) => {
          if (err) app.setPluginError(`Subscribe error: ${err.message}`);
        });
      });

      client.on('message', (topic, payload) => {
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
