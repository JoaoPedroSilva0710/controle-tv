'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const script = fs.readFileSync(require.resolve('../startup-probe/index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
assert(fs.readFileSync(require.resolve('../startup-probe/config.xml'), 'utf8').includes('origin="http://127.0.0.1:8134"'));
async function check(failure, synchronous, initiallyAvailable) {
  const elements = {}, timeouts = [];
  let available = initiallyAvailable, launches = 0, interval;
  const context = {
    document: { getElementById(id) { return elements[id] || (elements[id] = {}); } },
    fetch(url) {
      assert.strictEqual(url, 'http://127.0.0.1:8134/');
      return available ? Promise.resolve({ ok: true, json() { return Promise.resolve({ remaining: 120, protection: 'Ativa', error: null, started: 'agora', launch: 'OK' }); } }) : Promise.reject(Error('offline'));
    },
    setTimeout(callback) { timeouts.push(callback); },
    setInterval(callback) { interval = callback; },
    tizen: { application: { launch(id, success, failed) {
      assert.strictEqual(id, 'TVStartPrb.Service'); launches++;
      if (synchronous) throw Error('recusado');
      if (failure) failed({ message: 'recusado' });
      else { available = true; success(); }
    } } }
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  vm.runInNewContext(script, context); await flush();
  assert.strictEqual(launches, initiallyAvailable ? 0 : 1);
  if (failure || synchronous) {
    assert(elements.diagnostic.textContent.includes('recusado'));
    interval(); await flush();
    assert.strictEqual(launches, 1);
    assert.strictEqual(elements.remaining.textContent, 'Tempo indisponível');
  } else {
    if (!initiallyAvailable) { assert.strictEqual(timeouts.length, 1); timeouts[0](); await flush(); }
    assert.strictEqual(elements.protection.textContent, 'Proteção: Ativa');
    assert.strictEqual(elements.error.textContent, '');
    interval(); await flush();
    assert.strictEqual(launches, initiallyAvailable ? 0 : 1);
  }
}
(async () => {
  await check(false, false, false);
  await check(true, false, false);
  await check(false, true, false);
  await check(false, false, true);
  console.log('Controle da TV: recuperação e erros OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
