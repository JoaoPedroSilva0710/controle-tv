// Instala um .wgt na TV pelo TizenBrew Installer já aberto (ws://localhost:8091), que reassina o pacote com os
// certificados Samsung configurados nele. Não desinstala e não limpa dados do app.
//
//   node ferramentas/instalar.js <IP da TV> <arquivo.wgt>
//
// Depois de cada InstallFile, o instalador apaga os certificados da própria configuração (no código dele, o case
// InstallFile não tem break e cai em DeleteConfiguration; ~/share/tizenbrewInstallerConfig.json fica com tudo null).
// Este script guarda uma cópia antes e a devolve depois.
// Nunca envia DeleteConfiguration.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const [ip, wgt] = process.argv.slice(2);
if (!ip || !wgt) { console.error('Uso: node ferramentas/instalar.js <IP da TV> <arquivo.wgt>'); process.exit(2); }

const CONFIG = path.join(os.homedir(), 'share', 'tizenbrewInstallerConfig.json');
let saved = null;
try {
  const text = fs.readFileSync(CONFIG, 'utf8');
  if (JSON.parse(text).authorCert) saved = text;
} catch (e) {}
if (!saved) console.warn('Aviso: a configuração do instalador não tem certificados; a TV pode recusar o pacote.');

function restore() {
  if (!saved) return;
  try {
    if (!JSON.parse(fs.readFileSync(CONFIG, 'utf8')).authorCert) {
      fs.writeFileSync(CONFIG, saved, {mode: 0o600});
      console.log('Configuração de assinatura do instalador restaurada.');
    }
  } catch (e) { console.error('Não consegui conferir/restaurar a configuração: ' + e.message); }
}

const ws = new WebSocket('ws://localhost:8091');
const done = (code) => { restore(); try { ws.close(); } catch (e) {} setTimeout(() => process.exit(code), 200); };
setTimeout(() => { console.log('Tempo esgotado.'); done(2); }, 240000);
ws.onopen = () => ws.send(JSON.stringify({type: 6, payload: ip}));   // ConnectToTV
ws.onmessage = (e) => {
  const {type, payload} = JSON.parse(e.data);
  if (process.env.DEBUG) console.log('<-', type, JSON.stringify(payload).slice(0, 200));
  if (type === 6) {
    if (!payload.success) { console.log('Não conectou na TV: ' + payload.error); return done(1); }
    // The installer learns the Tizen version (sysinfo) only after it answers "connected": a package sent at once is
    // installed without being re-signed for Tizen 7+, and the TV refuses it ("Check certificate error").
    console.log('Conectado; enviando ' + path.basename(wgt) + ' em 3 s');
    setTimeout(() => ws.send(JSON.stringify({type: 7, payload: fs.readFileSync(wgt).toString('base64')})), 3000);   // InstallFile
  } else if (type === 4) {
    console.log('Estado: ' + payload);
  } else if (type === 1 && payload.response === 0) {
    const ok = /install completed/.test(payload.result || '');
    console.log(ok ? 'install completed' : (payload.result || '').trim());
    done(ok ? 0 : 1);
  } else if (type === 3) {
    console.log('Erro: ' + payload);
    done(1);
  }
};
ws.onerror = (e) => { console.log('Instalador não respondeu (está aberto?): ' + (e.message || e)); done(1); };
