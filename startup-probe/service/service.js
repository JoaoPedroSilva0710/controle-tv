'use strict';
var http, fs, quota;
var YOUTUBE_STATUS = '111299001912';
var HOME = 'FreeMyTVio.FreeMyTV';
var status = { started: null, remaining: null, protection: 'Iniciando', error: null, launch: 'pendente' };
var server, timer, state, path, previous, power, polling = false, dirty = false, lastTick = null;

function fail(message) { status.error = message; status.protection = 'Falha'; }
function launch() {
  try {
    tizen.application.launch(HOME, function () { status.launch = 'OK'; }, function (e) { status.launch = 'Erro: ' + e.name; fail('Não foi possível abrir Free My TV: ' + e.name); });
  } catch (e) { status.launch = 'Erro: ' + e.name; fail('Não foi possível abrir Free My TV: ' + e.name); }
}
function save() {
  try {
    fs.writeFileSync(path + '.tmp', JSON.stringify(state));
    fs.renameSync(path + '.tmp', path);
    return true;
  } catch (e) { fail('Não foi possível salvar o tempo de uso: ' + e.message); return false; }
}
function get(pathname, callback) {
  var done = false;
  function finish(error, value) { if (!done) { done = true; callback(error, value); } }
  var request = http.get({ host: '127.0.0.1', port: 8001, path: pathname }, function (response) {
    var body = '';
    response.on('data', function (chunk) { body += chunk; });
    response.on('error', function (e) { finish(e); });
    response.on('end', function () {
      try { if (response.statusCode !== 200) throw Error('HTTP ' + response.statusCode); finish(null, JSON.parse(body)); }
      catch (e) { finish(e); }
    });
  });
  request.setTimeout(1500, function () { finish(Error('timeout')); request.destroy(); });
  request.on('error', function (e) { finish(e); });
}
function tick() {
  if (polling) return;
  polling = true;
  var now = Date.now(), gap = lastTick !== null && now - lastTick > 10000;
  lastTick = now;
  get('/api/v2/', function (error, info) {
    var current = info && info.device && info.device.PowerState;
    if (error || (current !== 'on' && current !== 'off' && current !== 'standby')) {
      polling = false; previous = null; fail('Estado de energia indisponível.'); return;
    }
    if (current === 'on' && ((power && power !== 'on') || gap)) launch();
    power = current;
    if (current !== 'on') { polling = false; previous = null; status.protection = 'TV em espera'; return; }
    get('/api/v2/applications/' + YOUTUBE_STATUS, function (error, info) {
      polling = false;
      if (error || !info || typeof info.visible !== 'boolean') {
        previous = null; fail('Estado do YouTube indisponível.'); return;
      }
      var now = Date.now(), oldDay = state.day, oldUsed = state.used;
      var result = quota.advance(state, now, previous, info.visible);
      if (result.error) { previous = null; fail(result.error); return; }
      previous = { time: now, visible: info.visible };
      status.remaining = Math.ceil((quota.LIMIT - state.used) / 1000);
      if (oldDay !== state.day || oldUsed !== state.used) dirty = true;
      if (dirty) {
        if (!save()) { previous = null; return; }
        dirty = false;
      }
      status.error = null;
      status.protection = state.used >= quota.LIMIT ? 'Limite atingido' : 'Ativa';
      if (state.used >= quota.LIMIT && info.visible) launch();
    });
  });
}
function start() {
  if (status.started) return;
  status.started = new Date().toISOString();
  try {
    http = require('http');
    server = http.createServer(function (request, response) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end(JSON.stringify(status));
    });
    server.on('error', function (e) { fail('Diagnóstico indisponível: ' + e.message); });
    server.listen(8134, '127.0.0.1');
    fs = require('fs');
    quota = require('./quota.js');
    setTimeout(launch, 10000);
    initStorage();
  } catch (error) { fail('Falha ao iniciar o serviço: ' + (error.message || error.name || String(error))); }
}
function initStorage() {
  function retry(message) { fail(message); setTimeout(initStorage, 5000); }
  try { tizen.filesystem.resolve('wgt-private', function (directory) {
    try {
      path = decodeURIComponent(directory.toURI().replace(/^file:\/\//, '')) + '/quota.json';
      try { state = JSON.parse(fs.readFileSync(path, 'utf8')); }
      catch (e) {
        if (e.code === 'ENOENT') state = { day: quota.day(Date.now()), used: 0 };
        else if (e instanceof SyntaxError) { fail('Dados de uso inválidos.'); return; }
        else { retry('Não foi possível ler os dados de uso: ' + (e.message || e.name)); return; }
      }
      if (!quota.valid(state)) { fail('Dados de uso inválidos.'); return; }
      if (!save()) { setTimeout(initStorage, 5000); return; }
      tick();
      timer = setInterval(tick, 2000);
    } catch (e) { retry('Armazenamento indisponível: ' + (e.message || e.name || String(e))); }
  }, function (e) { retry('Armazenamento indisponível: ' + (e.message || e.name || String(e))); }, 'rw');
  } catch (e) { retry('Armazenamento indisponível: ' + (e.message || e.name || String(e))); }

}
module.exports.onStart = start;
module.exports.onRequest = start;
module.exports.onStop = function () { clearInterval(timer); if (server) server.close(); };
