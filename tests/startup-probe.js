'use strict';
const assert = require('assert');
const Module = require('module');
const EventEmitter = require('events');
const vm = require('vm');
const fs = require('fs');
const quota = require('../startup-probe/service/quota');
const today = new Date(2026, 10, 7, 12).getTime();
let state = { day: quota.day(today), used: 0 };
quota.advance(state, today + 2000, { time: today, visible: true }, true);
assert.strictEqual(state.used, 2000);
quota.advance(state, today + 4000, { time: today + 2000, visible: false }, true);
quota.advance(state, today + 9000, { time: today + 4000, visible: true }, true);
assert.strictEqual(state.used, 2000);
assert(quota.valid(JSON.parse(JSON.stringify(state))));
assert(!quota.valid({ day: state.day, used: -1 }));
assert(!quota.valid({ day: state.day, used: '0' }));
assert(quota.advance(state, today - 86400000, null, false).error);
quota.advance(state, new Date(2026, 10, 8, 0, 0, 1).getTime(), { time: today, visible: true }, true);
assert.strictEqual(state.used, 0);

const originalLoad = Module._load, originalTimeout = global.setTimeout, originalInterval = global.setInterval, originalNow = Date.now;
let now = today;
Date.now = function () { return now; };
let handler, interval, visible = true, power = 'on', failGet = false, launches = 0, resolves = 0;
let stored = JSON.stringify({ day: quota.day(today), used: quota.LIMIT - 1000 });
const fakeFs = {
  readFileSync() { return stored; },
  writeFileSync(path, contents) { stored = contents; },
  renameSync() {}
};
const fakeHttp = {
  createServer(fn) { handler = fn; return { on() {}, listen(port, host) { assert.strictEqual(host, '127.0.0.1'); }, close() {} }; },
  get(options, callback) {
    assert(['/api/v2/', '/api/v2/applications/111299001912'].includes(options.path));
    const req = new EventEmitter();
    req.setTimeout = function () {};
    req.destroy = function () {};
    process.nextTick(function () {
      if (failGet) { req.emit('error', Error('timeout')); return; }
      const response = new EventEmitter(); response.statusCode = 200; callback(response);
      response.emit('data', JSON.stringify(options.path === '/api/v2/' ? {device: {PowerState: power}} : {visible: visible}));
      response.emit('end');
    });
    return req;
  }
};
Module._load = function (name) { if (name === 'http') return fakeHttp; if (name === 'fs') return fakeFs; return originalLoad.apply(this, arguments); };
global.setTimeout = function (cb, delay) { if (delay !== 3000) cb(); return 1; };
global.setInterval = function (cb) { interval = cb; return 1; };
global.tizen = {
  filesystem: { resolve(name, success, error) { assert.strictEqual(name, 'wgt-private'); if (++resolves === 1) error({name:'UnknownError'}); else success({ toURI() { return 'file:///private'; } }); } },
  application: {
    launch(id, success) { assert.strictEqual(id, 'FreeMyTVio.FreeMyTV'); launches++; success(); },
    kill() { throw new Error('Não deve fechar processos'); }
  }
};
const service = require('../startup-probe/service/service');
function readStatus() { let result; handler({}, {writeHead() {}, end(body) { result = JSON.parse(body); }}); return result; }
function flush() { return new Promise(resolve => setImmediate(resolve)); }
(async function () {
  service.onRequest(); service.onStart(); await flush();
  assert.strictEqual(resolves, 2); assert.strictEqual(launches, 1);
  now += 2000;
  interval(); await flush();
  assert.strictEqual(launches, 2);
  interval(); await flush(); assert.strictEqual(launches, 3);
  failGet = true; interval(); await flush(); assert.strictEqual(readStatus().protection, 'Falha');
  failGet = false; power = 'off'; interval(); await flush(); assert.strictEqual(readStatus().protection, 'TV em espera');
  failGet = true; interval(); await flush(); assert.strictEqual(readStatus().protection, 'Falha');
  failGet = false; visible = false; power = 'on'; interval(); await flush(); assert.strictEqual(launches, 4);
  now += 11000; interval(); await flush(); assert.strictEqual(launches, 5);
  now += 2000; interval(); await flush(); assert.strictEqual(launches, 5);
  service.onStop();
  let imports = 0;
  const bootstrap = {module: {exports: {}}, require(name) {
    imports++;
    if (name === 'http') return fakeHttp;
    throw Error('Módulo indisponível');
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../startup-probe/service/service'), 'utf8'), bootstrap);
  bootstrap.module.exports.onStart(); bootstrap.module.exports.onRequest();
  assert.strictEqual(imports, 2);
  assert.strictEqual(readStatus().protection, 'Falha');
  assert(readStatus().error.includes('Módulo indisponível'));
  global.setTimeout = originalTimeout; global.setInterval = originalInterval; Date.now = originalNow; Module._load = originalLoad;
  console.log('Controle da TV: testes OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
