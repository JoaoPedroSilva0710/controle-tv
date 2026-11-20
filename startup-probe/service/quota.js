'use strict';
var LIMIT = 3600000;
function day(time) {
  var d = new Date(time);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function valid(state) {
  return state && Number.isInteger(state.day) && state.day >= 20000101 && state.day <= 99991231 &&
    Number.isFinite(state.used) && state.used >= 0 && state.used <= LIMIT;
}
function advance(state, now, previous, visible) {
  var today = day(now);
  if (today < state.day) return { error: 'Relógio da TV voltou para um dia anterior.' };
  if (today > state.day) { state.day = today; state.used = 0; }
  // shortcut: amostragem de 2 s pode perder até 4 s por abertura; trocar por evento de primeiro plano quando disponível.
  if (previous && previous.visible && visible && day(previous.time) === today) {
    var elapsed = now - previous.time;
    if (elapsed > 0 && elapsed <= 4000) state.used = Math.min(LIMIT, state.used + elapsed);
  }
  return { state: state };
}
module.exports = { LIMIT: LIMIT, day: day, valid: valid, advance: advance };
