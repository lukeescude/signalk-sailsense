'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { isLiveData, topicToPath, coerce } = require('../index.js');

// ─── isLiveData ───────────────────────────────────────────────────────────────

describe('isLiveData — Hub topics', () => {
  test('passes Hub/wifi', () =>
    assert.equal(isLiveData('Hub/wifi'), true));

  test('passes Hub/zigbee/bridge/state', () =>
    assert.equal(isLiveData('Hub/zigbee/bridge/state'), true));

  test('passes Hub/telematic/signalprocessed/rx', () =>
    assert.equal(isLiveData('Hub/telematic/signalprocessed/rx'), true));

  test('blocks any other Hub topic', () =>
    assert.equal(isLiveData('Hub/config/something'), false));
});

describe('isLiveData — Powernet topics', () => {
  test('passes voltmeter blob', () =>
    assert.equal(isLiveData('powernet/device/powerail/1/voltmeters/2'), true));

  test('passes input blob', () =>
    assert.equal(isLiveData('powernet/device/powerail/2/inputs/4'), true));

  test('passes output settings blob', () =>
    assert.equal(isLiveData('powernet/device/powerail/1/outputs/11/settings'), true));

  test('passes rail hull', () =>
    assert.equal(isLiveData('powernet/device/powerail/1/hull'), true));

  test('passes rail info', () =>
    assert.equal(isLiveData('powernet/device/powerail/1/info'), true));

  test('blocks sub-topic beneath settings', () =>
    assert.equal(isLiveData('powernet/device/powerail/1/outputs/11/settings/state'), false));

  test('blocks sub-topic beneath input blob', () =>
    assert.equal(isLiveData('powernet/device/powerail/1/inputs/4/value'), false));
});

describe('isLiveData — field_id_mapping filter', () => {
  test('blocks field_id_mapping topics on any group', () =>
    assert.equal(isLiveData('batteries/children/Main/field_id_mapping/voltage'), false));

  test('blocks field_id_mapping in actions group', () =>
    assert.equal(isLiveData('actions/children/nacelle_lights/field_id_mapping/x'), false));
});

describe('isLiveData — live-data suffix allowlist', () => {
  test('passes /voltage', () =>
    assert.equal(isLiveData('batteries/children/Main/children/Bank1/voltage'), true));

  test('passes /current', () =>
    assert.equal(isLiveData('batteries/children/Main/children/Bank1/current'), true));

  test('passes /percentage', () =>
    assert.equal(isLiveData('batteries/children/Main/children/Bank1/percentage'), true));

  test('passes /remaining', () =>
    assert.equal(isLiveData('batteries/children/Main/children/Bank1/remaining'), true));

  test('passes /state', () =>
    assert.equal(isLiveData('breakers/children/Cockpit fridge/state'), true));

  test('passes /alert', () =>
    assert.equal(isLiveData('tanks/children/water_tanks/children/water_tank_portside/alert'), true));

  test('passes /levels/%', () =>
    assert.equal(isLiveData('tanks/children/water_tanks/children/water_tank_portside/levels/%'), true));

  test('passes /levels/L', () =>
    assert.equal(isLiveData('tanks/children/water_tanks/children/water_tank_portside/levels/L'), true));

  test('passes /levels/gal', () =>
    assert.equal(isLiveData('tanks/children/water_tanks/children/water_tank_portside/levels/gal'), true));

  test('passes /levels/US gal', () =>
    assert.equal(isLiveData('tanks/children/water_tanks/children/water_tank_portside/levels/US gal'), true));

  test('passes /actionInProgress', () =>
    assert.equal(isLiveData('actions/children/nacelle_lights/children/Saloon light/actionInProgress'), true));

  test('passes /dimmer_step', () =>
    assert.equal(isLiveData('actions/children/nacelle_lights/children/Saloon light/dimmer_step'), true));

  test('blocks /label', () =>
    assert.equal(isLiveData('batteries/children/Main/children/Bank1/label'), false));

  test('blocks /config blob', () =>
    assert.equal(isLiveData('batteries/children/Main/children/Bank1/config'), false));

  test('blocks topic with no recognised suffix', () =>
    assert.equal(isLiveData('actions/children/nacelle_lights/children/Saloon light/unknown'), false));
});

// ─── topicToPath ──────────────────────────────────────────────────────────────

describe('topicToPath', () => {
  test('prefixes result with sailsense namespace', () =>
    assert.ok(topicToPath('batteries/voltage').startsWith('sailsense.')));

  test('strips children segments', () =>
    assert.equal(
      topicToPath('batteries/children/Main/children/Bank1/voltage'),
      'sailsense.batteries.Main.Bank1.voltage',
    ));

  test('converts % to pct', () =>
    assert.equal(
      topicToPath('tanks/children/water_tanks/children/water_tank_portside/levels/%'),
      'sailsense.tanks.water_tanks.water_tank_portside.levels.pct',
    ));

  test('converts spaces to underscores', () =>
    assert.equal(
      topicToPath('actions/children/nacelle_lights/children/Saloon light'),
      'sailsense.actions.nacelle_lights.Saloon_light',
    ));

  test('preserves hyphens, converts surrounding spaces', () =>
    assert.equal(
      topicToPath('breakers/children/Oven - plate inverter/state'),
      'sailsense.breakers.Oven_-_plate_inverter.state',
    ));

  test('handles STBD breaker name', () =>
    assert.equal(
      topicToPath('breakers/children/STBD front cabin fridge/state'),
      'sailsense.breakers.STBD_front_cabin_fridge.state',
    ));

  test('converts "US gal" space to underscore', () =>
    assert.equal(
      topicToPath('tanks/children/water_tanks/children/water_tank_portside/levels/US gal'),
      'sailsense.tanks.water_tanks.water_tank_portside.levels.US_gal',
    ));
});

// ─── coerce ───────────────────────────────────────────────────────────────────

describe('coerce', () => {
  test('converts "True" to boolean true', () =>
    assert.equal(coerce('True'), true));

  test('converts "False" to boolean false', () =>
    assert.equal(coerce('False'), false));

  test('converts integer string to number', () =>
    assert.equal(coerce('42'), 42));

  test('converts float string to number', () =>
    assert.equal(coerce('3.14'), 3.14));

  test('converts zero string to number', () =>
    assert.equal(coerce('0'), 0));

  test('converts negative number string', () =>
    assert.equal(coerce('-12.5'), -12.5));

  test('parses valid JSON object', () =>
    assert.deepEqual(coerce('{"key":"val","n":1}'), { key: 'val', n: 1 }));

  test('parses valid JSON array', () =>
    assert.deepEqual(coerce('[1,2,3]'), [1, 2, 3]));

  test('returns plain string for non-JSON non-numeric input', () =>
    assert.equal(coerce('hello'), 'hello'));

  test('returns empty string for empty input', () =>
    assert.equal(coerce(''), ''));

  test('does not coerce "NaN" to a number', () =>
    assert.equal(coerce('NaN'), 'NaN'));
});

// ─── Plugin factory ───────────────────────────────────────────────────────────

describe('plugin factory', () => {
  const makeApp = () => ({
    setPluginStatus: () => {},
    setPluginError:  () => {},
    handleMessage:   () => {},
    get:             () => {},
  });

  test('default export is a function', () =>
    assert.equal(typeof require('../index.js'), 'function'));

  test('returns a plugin object with required fields', () => {
    const plugin = require('../index.js')(makeApp());
    assert.equal(plugin.id, 'signalk-sailsense');
    assert.equal(typeof plugin.name, 'string');
    assert.equal(typeof plugin.description, 'string');
    assert.equal(typeof plugin.schema, 'object');
    assert.equal(typeof plugin.start, 'function');
    assert.equal(typeof plugin.stop, 'function');
  });

  test('schema is JSON-serialisable', () => {
    const plugin = require('../index.js')(makeApp());
    assert.doesNotThrow(() => JSON.stringify(plugin.schema));
  });

  test('start with all topics disabled sets status and does not throw', () => {
    let status = null;
    const app = { ...makeApp(), setPluginStatus: (msg) => { status = msg; } };
    const plugin = require('../index.js')(app);
    const allOff = Object.fromEntries(
      ['batteries','tanks','actions','breakers','hub','powernet','shortcuts','ui_config']
        .map(k => [k, false])
    );
    assert.doesNotThrow(() => plugin.start({ mqttHost: 'localhost', topics: allOff }));
    assert.ok(status != null && status.includes('No topics'));
  });

  test('stop does not throw when called before start', () => {
    const plugin = require('../index.js')(makeApp());
    assert.doesNotThrow(() => plugin.stop());
  });
});
