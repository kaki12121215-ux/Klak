/* Klak · máquina de escribir para notas y diario
   Versión 1.1.0 */
(function () {
'use strict';
const VERSION = '1.1.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmt = n => n.toLocaleString('es-ES');

/* ================= DATOS ================= */
const KEY = 'klak.data';
const DEF_SET = {
  teclado: 'klak', hoja: 'a5', autocap: true, sonido: true, volumen: 0.7, campanilla: true, silencio: false,
  fondo: 'claro', tinta: 'usada', teclas: 'negro', real: true,
  lampAuto: false, lampOn: false
};
let DB = { notes: [], seps: [], settings: { ...DEF_SET } };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { const d = JSON.parse(raw); DB = { notes: d.notes || [], seps: d.seps || [], settings: { ...DEF_SET, ...(d.settings || {}) } }; }
} catch (e) { console.warn('No se pudieron leer los datos', e); }
if (!DB.seps.length && !localStorage.getItem(KEY)) DB.seps = [{ id: 's1', name: 'Diario' }, { id: 's2', name: 'Notas' }, { id: 's3', name: 'Ideas' }];
const S = DB.settings;
// 1.1.0: solo quedan 4 teclados y 2 fondos
if (!['negro', 'marfil', 'piedra', 'verde'].includes(S.teclas)) S.teclas = 'negro';
if (!['claro', 'crema'].includes(S.fondo)) S.fondo = 'claro';
DB.notes.forEach(n => { if (n.look && n.look.teclas && !['negro', 'marfil', 'piedra', 'verde'].includes(n.look.teclas)) n.look.teclas = 'negro'; });
const DESK = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
document.body.classList.toggle('desk', DESK);
let note = null;
const V = k => (note && note.look && note.look[k] != null) ? note.look[k] : S[k];
let saveT = null;
function save(now) {
  clearTimeout(saveT);
  const go = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('No se ha podido guardar'); } };
  if (now) go(); else saveT = setTimeout(go, 300);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
window.addEventListener('pagehide', () => save(true));
// papelera: borrar definitivamente lo que lleva más de 30 días
(function purge() {
  const lim = Date.now() - 30 * 864e5;
  const n = DB.notes.length;
  DB.notes = DB.notes.filter(x => !(x.deleted && x.deleted < lim));
  if (DB.notes.length !== n) save();
})();

/* ================= UTILIDADES UI ================= */
let toastEl = null, toastT = null;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2000);
}
const dim = $('#dim'), sheetUI = $('#sheetUI');
let sheetOnClose = null;
function openSheet(html, onClose) {
  sheetUI.innerHTML = '<div class="grab"></div>' + html;
  sheetOnClose = onClose || null;
  dim.classList.add('on'); sheetUI.classList.add('on');
  $$('.seg', sheetUI).forEach(sg => placePill(sg));
  enter(Array.from(sheetUI.children).slice(1), { dur: 380, delay: 160 });
}
function closeSheet() {
  dim.classList.remove('on'); sheetUI.classList.remove('on');
  const f = sheetOnClose; sheetOnClose = null; if (f) f();
}
dim.addEventListener('click', closeSheet);
function actionSheet(title, opts) {
  openSheet(`<div class="sh-t">${esc(title)}</div>` + opts.map((o, i) =>
    `<button class="${i === 0 ? 'bigbtn' : 'ghost'} ${o.danger ? 'danger' : ''}" data-i="${i}" style="${i ? 'display:block;width:100%;margin-top:10px' : ''}">${esc(o.label)}</button>`).join('') +
    `<button class="ghost" data-i="x" style="display:block;width:100%;margin-top:10px;border:0">Cancelar</button>`);
  $$('[data-i]', sheetUI).forEach(b => b.onclick = () => { const i = b.dataset.i; closeSheet(); if (i !== 'x') setTimeout(opts[+i].fn, 330); });
}
function promptSheet(title, value, onOk, okLabel = 'Guardar') {
  openSheet(`<div class="sh-t">${esc(title)}</div><div class="opt"><input class="field" id="pmIn" value="${esc(value || '')}" maxlength="30"></div>
    <button class="bigbtn" id="pmOk">${okLabel}</button>`);
  const inp = $('#pmIn'); setTimeout(() => inp.focus(), 250);
  const ok = () => { const v = inp.value.trim(); closeSheet(); if (v) onOk(v); };
  $('#pmOk').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
}
function longPress(el, fn, ms = 500) {
  let t = null, sx = 0, sy = 0, fired = false;
  el.addEventListener('pointerdown', e => { fired = false; sx = e.clientX; sy = e.clientY; t = setTimeout(() => { fired = true; fn(e); }, ms); });
  el.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(t); t = null; } });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { clearTimeout(t); t = null; }));
  el.addEventListener('click', e => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/* ================= VISTAS ================= */
let current = 'vCaja';
function show(id) {
  const prev = current;
  $$('.view').forEach(v => { v.classList.toggle('active', v.id === id); v.classList.remove('keep'); });
  if (id === 'vEditor' && prev !== id) $('#' + prev).classList.add('keep');
  current = id;
}

/* ================= ANIMACIONES AMABLES ================= */
const E_IN = 'cubic-bezier(.2,0,0,1)', E_OUT = 'cubic-bezier(.4,0,1,1)';
const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function enter(els, o = {}) {
  const { rise = 10, dur = 460, gap = 60, delay = 0 } = o;
  els.forEach((el, i) => { if (el.animate) el.animate(
    RM ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: `0 ${rise}px` }, { opacity: 1, translate: '0 0' }],
    { duration: RM ? 150 : dur, easing: E_IN, delay: RM ? 0 : delay + Math.min(i, 5) * gap, fill: 'backwards' }); });
}
function placePill(seg, anim) {
  const on = $('button.on', seg), pill = $('.seg-pill', seg); if (!on || !pill) return;
  if (!anim) pill.style.transition = 'none';
  pill.style.left = on.offsetLeft + 'px'; pill.style.width = on.offsetWidth + 'px';
  if (!anim) { void pill.offsetWidth; pill.style.transition = ''; }
}
function segPick(b) {
  $$('button', b.parentNode).forEach(x => x.classList.toggle('on', x === b));
  placePill(b.parentNode, true);
}
const PRESS = '.fx-tab,.lk button,.circ,.newb,.trashb,.card,.tab,.pill,.ghost,.bigbtn,.seg button,.tog,.sws button,.sr.click,.ed-count';
document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest(PRESS); if (!el) return;
  el.classList.add('pressed');
  const up = () => { el.classList.remove('pressed'); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); };
  addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
});

/* ================= APARIENCIA ================= */
const FONDOS = { claro: 'Claro', crema: 'Crema' };
const FONDO_COL = { claro: '#E4E5EC', crema: '#EFE6D2' };
const TECLAS = { negro: 'Negro', marfil: 'Marfil', piedra: 'Piedra', verde: 'Verde' };
function applyLook() {
  const b = document.body, f = FONDOS[V('fondo')] ? V('fondo') : 'claro';
  b.classList.toggle('f-crema', f === 'crema');
  b.classList.toggle('noche', !!S.lampOn);
  Object.keys(TECLAS).forEach(t => $('#vEditor').classList.toggle('kb-' + t, t !== 'negro' && V('teclas') === t));
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.lampOn ? '#131216' : FONDO_COL[f];
}
function setUnit() {
  const w = Math.min(window.innerWidth, 560);
  const u = Math.max(28, Math.min(48, Math.floor((w - 12 - 18) / 10)));
  document.documentElement.style.setProperty('--u', u + 'px');
}
setUnit();
window.addEventListener('resize', () => { setUnit(); if (current === 'vEditor') { measure(); render(true); } });

/* ================= SONIDO ================= */
const AC = window.AudioContext || window.webkitAudioContext;
let actx = null; const BUF = {}; let lastKey = -1;
const SND_FILES = ['espacio', 'mayus', 'borrar', 'campanilla', 'retorno', 'cargar_hoja', 'lampara'];
for (let i = 1; i <= 16; i++) SND_FILES.push('tecla_' + String(i).padStart(2, '0'));
function audioInit() {
  if (actx || !AC) return;
  actx = new AC();
  SND_FILES.forEach(n => {
    fetch('snd/' + n + '.mp3').then(r => r.arrayBuffer()).then(ab => new Promise((ok, ko) => {
      const p = actx.decodeAudioData(ab, ok, ko); if (p && p.then) p.then(ok, ko);
    })).then(b => { BUF[n] = b; }).catch(() => {});
  });
}
function audioUnlock() {
  audioInit();
  if (actx && actx.state !== 'running') actx.resume();
  try { if (navigator.audioSession) navigator.audioSession.type = S.silencio ? 'playback' : 'ambient'; } catch (e) {}
}
function play(name, gain = 1) {
  if (!S.sonido || !actx) return;
  let buf;
  if (name === 'tecla') {
    const keys = Object.keys(BUF).filter(k => k.startsWith('tecla_')).sort();
    if (!keys.length) return;
    let i; do { i = Math.floor(Math.random() * keys.length); } while (keys.length > 1 && i === lastKey);
    lastKey = i; buf = BUF[keys[i]];
  } else buf = BUF[name];
  if (!buf) return;
  const src = actx.createBufferSource(); src.buffer = buf;
  const vary = name === 'campanilla' || name === 'cargar_hoja' ? 0.02 : 0.08;
  src.playbackRate.value = 1 + (Math.random() - 0.5) * vary;
  const g = actx.createGain();
  g.gain.value = S.volumen * gain * (0.85 + Math.random() * 0.15);
  src.connect(g).connect(actx.destination);
  src.start(actx.currentTime + Math.random() * 0.004);
}
document.addEventListener('pointerdown', audioUnlock, { capture: true });
document.addEventListener('keydown', audioUnlock, { capture: true });

/* ================= CAJA ================= */
let tabSel = 'all', query = '';
const titleOf = t => { const l = (t || '').split('\n').map(s => s.trim()).find(s => s); return l ? l.slice(0, 40) : 'Sin título'; };
const bodyOf = t => { const ls = (t || '').split('\n'); const i = ls.findIndex(s => s.trim()); return ls.slice(i + 1).join(' ').trim() || ''; };
const words = t => ((t || '').match(/\S+/g) || []).length;
let tabsSig = null;
function renderTabs() {
  const tabs = $('#tabs');
  tabs.innerHTML = `<button class="mn-tab" data-s="all">Todas</button>` +
    DB.seps.map(s => `<button class="mn-tab" data-s="${s.id}">${esc(s.name)}</button>`).join('') +
    `<button class="mn-tab add" id="tabAdd" aria-label="Nuevo separador">+</button>`;
  $$('.mn-tab[data-s]', tabs).forEach(b => {
    b.onclick = () => { if (b.dataset.s === tabSel) return; tabSel = b.dataset.s; play('mayus', 0.5); renderCaja(true); };
    if (b.dataset.s !== 'all') longPress(b, () => sepMenu(b.dataset.s));
  });
  $('#tabAdd').onclick = () => promptSheet('Nuevo separador', '', name => { const s = { id: uid(), name }; DB.seps.push(s); tabSel = s.id; save(); renderCaja(true); }, 'Crear');
}
function syncTabs() { $$('#tabs .mn-tab[data-s]').forEach(b => b.classList.toggle('sel', b.dataset.s === tabSel)); }
function sepMenu(id) {
  const s = DB.seps.find(x => x.id === id); if (!s) return;
  actionSheet(s.name, [
    { label: 'Cambiar nombre', fn: () => promptSheet('Cambiar nombre', s.name, v => { s.name = v; save(); renderCaja(); }) },
    { label: 'Quitar separador', danger: true, fn: () => { DB.seps = DB.seps.filter(x => x.id !== id); DB.notes.forEach(n => { if (n.sep === id) n.sep = null; }); if (tabSel === id) tabSel = 'all'; save(); renderCaja(true); } }
  ]);
}
function renderCaja(anim) {
  const sig = DB.seps.map(x => x.id + ':' + x.name).join('|');
  if (sig !== tabsSig) { tabsSig = sig; renderTabs(); }
  syncTabs();
  const q = query.toLowerCase();
  const list = DB.notes.filter(n => !n.deleted && (tabSel === 'all' || n.sep === tabSel) && (!q || n.text.toLowerCase().includes(q)))
    .sort((a, b) => b.updated - a.updated);
  const box = $('#cjBox');
  if (!list.length) {
    box.innerHTML = `<div class="mn-empty">${q ? 'No hay hojas con esas palabras.' : 'Aún no hay hojas aquí.<br>Pulsa «Nueva hoja» y empieza a escribir.'}</div>`;
  } else {
    let h = '', mk = null;
    list.forEach(n => {
      const d = new Date(n.updated), k = d.getFullYear() * 12 + d.getMonth();
      if (k !== mk) { mk = k; const m = MESES[d.getMonth()]; h += `<div class="mn-month">${m}${d.getFullYear() !== new Date().getFullYear() ? ' de ' + d.getFullYear() : ''}</div>`; }
      const w = words(n.text), sep = DB.seps.find(x => x.id === n.sep);
      h += `<button class="mn-item" data-id="${n.id}"><span class="mn-d"><b>${d.getDate()}</b><i>${MES3[d.getMonth()]}</i></span>
        <span class="mn-tx"><span class="mn-t">${esc(titleOf(n.text))}</span><span class="mn-b">${esc(bodyOf(n.text)) || '&nbsp;'}</span>
        <span class="mn-m">${w} ${w === 1 ? 'palabra' : 'palabras'}${sep && tabSel === 'all' ? ' · ' + esc(sep.name) : ''}</span></span></button>`;
    });
    box.innerHTML = h;
    $$('.mn-item', box).forEach(b => { b.onclick = () => openNote(b.dataset.id); longPress(b, () => noteMenu(b.dataset.id)); });
  }
  if (anim) enter(Array.from(box.children).slice(0, 10), { rise: 12, dur: 420, gap: 45 });
}
function noteMenu(id) {
  const n = DB.notes.find(x => x.id === id); if (!n) return;
  actionSheet(titleOf(n.text), [
    { label: 'Abrir', fn: () => openNote(id) },
    { label: 'Mover a un separador', fn: () => actionSheet('Mover a', [{ label: 'Sin separador', fn: () => { n.sep = null; save(); renderCaja(); } }]
        .concat(DB.seps.map(s => ({ label: s.name, fn: () => { n.sep = s.id; save(); renderCaja(); } })))) },
    { label: 'Mover a la papelera', danger: true, fn: () => { n.deleted = Date.now(); save(); renderCaja(); toast('Hoja en la papelera'); } }
  ]);
}
function lookSheet(title, look, okLabel, onChange, onOk) {
  const dots = (k, names, col) => `<div class="sws strip">` + Object.keys(names).map(x => `<button data-lk="${k}" data-v="${x}" class="${look[k] === x ? 'on' : ''}" style="background:${col(x)}" aria-label="${names[x]}"></button>`).join('') + `</div>`;
  openSheet(`<div class="sh-t">${title}</div>
    <div class="lk"><div class="lk-l">Fondo<i data-n="fondo">${FONDOS[look.fondo] || 'Claro'}</i></div>${dots('fondo', FONDOS, x => FONDO_COL[x])}</div>
    <div class="lk"><div class="lk-l">Teclado<i data-n="teclas">${TECLAS[look.teclas]}</i></div><div class="sws strip">${Object.keys(TECLAS).map(x => `<button data-lk="teclas" data-v="${x}" class="tk ${look.teclas === x ? 'on' : ''}" style="background-image:url(img/tecla${x === 'negro' ? '' : '_' + x}.png)" aria-label="${TECLAS[x]}"></button>`).join('')}</div></div>
    <div class="lk row"><div class="lk-l">Tamaño</div><div class="seg"><i class="seg-pill"></i><button data-lk="hoja" data-v="a5" class="${look.hoja === 'a5' ? 'on' : ''}">A5</button><button data-lk="hoja" data-v="a4" class="${look.hoja === 'a4' ? 'on' : ''}">A4 con carro</button></div></div>
    <button class="bigbtn" id="lkOk">${okLabel}</button>`);
  const NM = { fondo: FONDOS, teclas: TECLAS };
  $$('[data-lk]', sheetUI).forEach(b => b.onclick = () => {
    const k = b.dataset.lk; look[k] = b.dataset.v;
    if (k === 'hoja') segPick(b); else { $$(`[data-lk="${k}"]`, sheetUI).forEach(x => x.classList.toggle('on', x === b)); $(`[data-n="${k}"]`, sheetUI).textContent = NM[k][look[k]]; }
    if (onChange) onChange();
  });
  $('#lkOk').onclick = () => { closeSheet(); if (onOk) onOk(); };
}
$('#btnNueva').onclick = () => {
  const look = { fondo: S.fondo, teclas: S.teclas, hoja: S.hoja };
  lookSheet('Hoja nueva', look, 'Empezar a escribir', null, () => {
    const n = { id: uid(), text: '', sep: tabSel === 'all' ? null : tabSel, created: Date.now(), updated: Date.now(), look };
    DB.notes.push(n); setTimeout(() => openNote(n.id, true), 220);
  });
};
$('#btnBuscar').onclick = () => { $('#cjSearch').classList.add('on'); $('#inBuscar').focus(); };
$('#btnBuscarCerrar').onclick = () => { $('#cjSearch').classList.remove('on'); $('#inBuscar').value = ''; const had = query; query = ''; renderCaja(!!had); };
$('#inBuscar').oninput = e => { query = e.target.value; renderCaja(true); };
$('#btnPapelera').onclick = () => { renderPapelera(); show('vPapelera'); enter(Array.from($('#ppBody').children), { delay: 160 }); };
$('#btnAjustes').onclick = () => { renderAjustes(); show('vAjustes'); enter(Array.from($('#setBody').children), { delay: 160 }); };

/* ================= PAPELERA ================= */
function renderPapelera() {
  const list = DB.notes.filter(n => n.deleted).sort((a, b) => b.deleted - a.deleted);
  const body = $('#ppBody');
  if (!list.length) { body.innerHTML = '<div class="empty">La papelera está vacía.<br>Las hojas se borran solas a los 30 días.</div>'; return; }
  body.innerHTML = `<p class="pp-note">Las hojas se borran solas a los 30 días.</p>` +
    list.map(n => {
      const dias = Math.max(0, 30 - Math.floor((Date.now() - n.deleted) / 864e5)), w = words(n.text);
      return `<div class="pp-item"><div class="pp-t"><div class="ct">${esc(titleOf(n.text))}</div><div class="cm">${w} ${w === 1 ? 'palabra' : 'palabras'}, ${dias === 1 ? 'queda 1 día' : 'quedan ' + dias + ' días'}</div></div>
      <div class="acts"><button class="pill solid" data-r="${n.id}">Recuperar</button><button class="pill danger" data-d="${n.id}">Borrar</button></div></div>`;
    }).join('') + `<button class="ghost danger" id="ppVaciar">Vaciar papelera</button>`;
  $$('[data-r]', body).forEach(b => b.onclick = () => { const n = DB.notes.find(x => x.id === b.dataset.r); delete n.deleted; save(); toast('Hoja recuperada'); const it = b.closest('.pp-item'); it.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: RM ? 1 : 0.94 }], { duration: 220, easing: E_OUT, fill: 'forwards' }); setTimeout(renderPapelera, 230); });
  $$('[data-d]', body).forEach(b => b.onclick = () => actionSheet('¿Borrar esta hoja para siempre?', [{ label: 'Borrar para siempre', danger: true, fn: () => { DB.notes = DB.notes.filter(x => x.id !== b.dataset.d); save(); renderPapelera(); } }]));
  $('#ppVaciar').onclick = () => actionSheet('¿Vaciar la papelera?', [{ label: 'Vaciar', danger: true, fn: () => { DB.notes = DB.notes.filter(x => !x.deleted); save(); renderPapelera(); } }]);
}
$('#btnPpVolver').onclick = () => { renderCaja(); show('vCaja'); };

/* ================= AJUSTES ================= */
function seg(key, opts) { return `<div class="seg"><i class="seg-pill"></i>` + opts.map(([v, l]) => `<button data-k="${key}" data-v="${v}" class="${S[key] === v ? 'on' : ''}">${l}</button>`).join('') + '</div>'; }
function tog(key) { return `<button class="tog ${S[key] ? 'on' : ''}" data-t="${key}" aria-label="${key}"><i></i></button>`; }
function rng(key, min, max, step) { return `<input type="range" data-r="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}">`; }
function renderAjustes() {
  const strip = (attr, names, cur, img, cls) => `<div class="sws strip">` + Object.keys(names).map(x => `<button data-${attr}="${x}" class="${cur === x ? 'on' : ''} ${cls || ''}" style="background-image:url(${img(x)})" aria-label="${names[x]}"></button>`).join('') + `</div>`;
  $('#setBody').innerHTML = `
  <div class="sg">Escritura</div>
  <div class="sr"><span>Teclado</span>${seg('teclado', [['klak', 'Klak'], ['ios', 'iOS']])}</div>
  <div class="sr"><span>Mayúscula automática</span>${tog('autocap')}</div>
  <div class="sr"><span>Modo máquina real<small>Borrar solo retrocede: lo nuevo se escribe encima y la tinta se acumula</small></span>${tog('real')}</div>
  <div class="sg">Sonido</div>
  <div class="sr"><span>Sonido de teclas</span>${tog('sonido')}</div>
  <div class="sr"><span>Volumen</span>${rng('volumen', 0.1, 1, 0.05)}</div>
  <div class="sr"><span>Campanilla al final de línea</span>${tog('campanilla')}</div>
  <div class="sr"><span>Sonar con el móvil en silencio</span>${tog('silencio')}</div>
  <div class="sg">Hojas nuevas</div>
  <p class="sg-n">Cada hoja guarda su aspecto. Esto es lo que trae una hoja recién creada.</p>
  <div class="sr"><span>Fondo</span><div class="sws strip">${Object.keys(FONDOS).map(x => `<button data-fo="${x}" class="${S.fondo === x ? 'on' : ''}" style="background:${FONDO_COL[x]}" aria-label="${FONDOS[x]}"></button>`).join('')}</div></div>
  <div class="sr"><span>Color del teclado</span>${strip('tk', TECLAS, S.teclas, x => `img/tecla${x === 'negro' ? '' : '_' + x}.png`, 'tk')}</div>
  <div class="sr"><span>Tinta</span>${seg('tinta', [['nueva', 'Nueva'], ['usada', 'Usada'], ['gastada', 'Gastada']])}</div>
  <div class="sr"><span>Tamaño</span>${seg('hoja', [['a5', 'A5'], ['a4', 'A4 con carro']])}</div>
  <div class="sg">Noche</div>
  <div class="sr"><span>Modo noche</span>${tog('lampOn')}</div>
  <div class="sr"><span>Encender al anochecer</span>${tog('lampAuto')}</div>
  <div class="sg">Copia de seguridad</div>
  <div class="sr click" id="setExp"><span>Descargar una copia de todas las hojas</span><span class="chev">&rsaquo;</span></div>
  <div class="sr click" id="setImp"><span>Restaurar una copia</span><span class="chev">&rsaquo;</span></div>
  <input type="file" id="impFile" accept=".json,application/json" style="display:none">
  <div class="ver">Klak, versión ${VERSION}</div>`;
  const B = $('#setBody');
  $$('[data-k]', B).forEach(b => b.onclick = () => { S[b.dataset.k] = b.dataset.v; save(); applyLook(); segPick(b); });
  $$('[data-t]', B).forEach(b => b.onclick = () => { S[b.dataset.t] = !S[b.dataset.t]; b.classList.toggle('on', S[b.dataset.t]); save(); audioUnlock(); if (b.dataset.t === 'lampOn') applyLook(); });
  $$('[data-r]', B).forEach(r => r.oninput = () => { S[r.dataset.r] = +r.value; save(); applyLook(); if (r.dataset.r === 'volumen') { audioUnlock(); play('tecla'); } });
  $$('[data-fo]', B).forEach(b => b.onclick = () => { S.fondo = b.dataset.fo; save(); applyLook(); $$('[data-fo]', B).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-tk]', B).forEach(b => b.onclick = () => { S.teclas = b.dataset.tk; save(); applyLook(); $$('[data-tk]', B).forEach(x => x.classList.toggle('on', x === b)); });
  $$('.seg', B).forEach(sg => placePill(sg));
  $('#setExp').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'klak', version: VERSION, fecha: new Date().toISOString(), ...DB }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'klak-copia-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('#setImp').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      const d = JSON.parse(t);
      if (!d || !Array.isArray(d.notes)) throw 0;
      actionSheet(`¿Restaurar ${d.notes.length} hojas?`, [{ label: 'Restaurar (sustituye lo actual)', danger: true, fn: () => {
        DB.notes = d.notes; DB.seps = d.seps || []; Object.assign(S, d.settings || {}); save(true); applyLook(); renderAjustes(); toast('Copia restaurada');
      } }]);
    }).catch(() => toast('Ese archivo no es una copia de Klak'));
  };
}
$('#btnAjVolver').onclick = () => { renderCaja(); show('vCaja'); };

/* ================= MÁQUINA DE ESCRIBIR ================= */
const FMT = {
  a5: { cols: 35, ratio: 1.414, padX: 0.075, padY: 0.09, lh: 1.6 },
  a4: { cols: 62, ratio: 1.414, padX: 0.075, padY: 0.08, lh: 1.6, fs: 19 }
};
const TINTA = { nueva: 0.35, usada: 0.75, gastada: 1.25 };
let G = null; // G = geometría actual
let lines = [], caret = { line: 0, col: 0 }, pageHTML = [], bellLine = -1, overview = false;
let back = 0; // modo máquina real: cuántas letras ha retrocedido el carro en el renglón
const edZone = $('#edZone'), edScroll = $('#edScroll'), edSheets = $('#edSheets');
const edHead = $('#edHead'), edBar = $('#edBar'), edLight = $('#edLight');

function measure() {
  const f = { ...(FMT[V('hoja')] || FMT.a5) };
  const zw = edZone.clientWidth || window.innerWidth, zh = edZone.clientHeight || 400;
  let w, fs;
  if (V('hoja') === 'a4') { fs = f.fs; w = f.cols * 0.6 * fs / (1 - 2 * f.padX); }
  else if (DESK && zw > 700) { f.cols = 64; fs = Math.min(22, (zw - 80) * (1 - 2 * f.padX) / (f.cols * 0.6)); w = f.cols * 0.6 * fs / (1 - 2 * f.padX); }
  else { w = Math.min(zw - 20, 560); fs = w * (1 - 2 * f.padX) / (f.cols * 0.6); }
  const h = w * f.ratio, lh = fs * f.lh, padT = w * f.padY, padL = w * f.padX;
  const rows = Math.max(8, Math.floor((h - 2 * padT) / lh));
  // la barra: en el ordenador deja folio por debajo; en el móvil, pegada al teclado
  const barY = DESK ? Math.round(zh - Math.max(60, zh * 0.1)) : Math.round(zh - 22);
  G = { ...f, mode: V('hoja'), w, h, fs, lh, padT, padL, rows, cw: fs * 0.6, zw, zh, barY };
  edSheets.classList.toggle('carro', V('hoja') === 'a4' && !overview);
  edSheets.style.width = V('hoja') === 'a4' ? w + 'px' : '100%';
  edSheets.style.padding = overview ? '14px 0 40px' : `${zh}px 0 ${zh}px`;
  edSheets.style.setProperty('--lh', lh + 'px');
  edSheets.style.setProperty('--cw', (fs * 0.6) + 'px');
  edSheets.style.setProperty('--padT', padT + 'px');
  edZone.style.setProperty('--barY', barY + 'px');
  edZone.style.setProperty('--fs', fs + 'px');
  pageHTML = [];
}

function layout(text, cols) {
  const L = [[]];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { L.push([]); continue; }
    let cur = L[L.length - 1];
    if (cur.length < cols) { cur.push([ch, i]); continue; }
    if (ch === ' ') { L.push([]); continue; }
    let s = -1; for (let j = cur.length - 1; j >= 0; j--) if (cur[j][0] === ' ') { s = j; break; }
    if (s > cols * 0.3) { const rest = cur.splice(s + 1); cur.pop(); L.push(rest.concat([[ch, i]])); }
    else L.push([[ch, i]]);
  }
  return L;
}

function jitter(idx, ch, k) {
  let h = (Math.imul(idx + 1, 2654435761) ^ Math.imul(ch.charCodeAt(0) + 7, 40503)) >>> 0;
  const r1 = (h & 1023) / 1023, r2 = ((h >>> 10) & 1023) / 1023, r3 = ((h >>> 20) & 1023) / 1023;
  const dy = (r1 - 0.5) * 1.3 * k, dx = (r3 - 0.5) * 0.9 * k;
  let op = 1 - r2 * 0.36 * k; if (k > 1 && r3 < 0.07) op *= 0.55;
  return `transform:translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px);opacity:${Math.max(0.35, op).toFixed(2)}`;
}
/* una letra: si se ha escrito encima, se apilan todos los golpes y la tinta se acumula */
function cellHTML(n, ch, idx, k) {
  const ov = n && n.over && n.over[idx];
  if (!ov || !ov.length) return ch === ' ' ? '<span> </span>' : `<span style="${jitter(idx, ch, k)}">${esc(ch)}</span>`;
  const all = ov.concat(ch === ' ' ? [] : [ch]);
  const g = Math.min(4, all.length);
  return `<span class="ov o${g}">` + all.map((c, j) => `<b style="${jitter(idx * 7 + j * 131 + 3, c, Math.max(k, 0.5))}">${esc(c)}</b>`).join('') + '</span>';
}
function lineHTML(arr, k) {
  let s = '';
  for (const [ch, idx] of arr) s += cellHTML(note, ch, idx, k);
  return `<div class="ed-line">${s || ' '}</div>`;
}

function render(full) {
  if (!note || !G) return;
  const prevLen = lines.length;
  lines = layout(note.text, G.cols);
  if (!full && prevLen && lines.length > prevLen) retUntil = performance.now() + 1350;
  const lastLen = lines[lines.length - 1].length;
  if (back > lastLen) back = lastLen;
  caret = { line: lines.length - 1, col: lastLen - back };
  const pages = Math.max(1, Math.ceil(lines.length / G.rows));
  const k = TINTA[V('tinta')] || 0.75;
  if (full || edSheets.children.length !== pages) {
    edSheets.innerHTML = '';
    for (let p = 0; p < pages; p++) {
      const sh = document.createElement('div');
      sh.className = 'ed-sheet';
      sh.style.cssText = `width:${G.w}px;height:${G.h}px;margin-left:${V('hoja') === 'a4' ? 0 : 'auto'}`;
      sh.innerHTML = `<div class="ed-lines" style="left:${G.padL}px;top:${G.padT}px;font-size:${G.fs}px"></div>`;
      edSheets.appendChild(sh);
    }
    pageHTML = [];
  }
  for (let p = 0; p < pages; p++) {
    let h = '';
    for (let r = p * G.rows; r < Math.min(lines.length, (p + 1) * G.rows); r++) h += lineHTML(lines[r], k);
    if (pageHTML[p] !== h) { edSheets.children[p].firstChild.innerHTML = h; pageHTML[p] = h; }
  }
  // contador
  const cp = Math.floor(caret.line / G.rows);
  let used = 0; for (let r = cp * G.rows; r < Math.min(lines.length, (cp + 1) * G.rows); r++) used += lines[r].length;
  $('#edCount').innerHTML = overview ? '<span>Hoja entera</span>' : `<span>Hoja ${cp + 1}</span><i></i><span>${fmt(used)} de ${fmt(G.cols * G.rows)}</span>`;
  if (!overview) place();
}

let scrollAnim = null, retUntil = 0;
function place(retorno) {
  if (retorno) retUntil = performance.now() + 1350;
  retorno = performance.now() < retUntil;
  const cp = Math.floor(caret.line / G.rows), row = caret.line % G.rows;
  const sheet = edSheets.children[cp]; if (!sheet) return;
  const lineTop = sheet.offsetTop + G.padT + row * G.lh;
  // el renglón que se escribe queda justo encima de la barra
  const target = Math.max(0, lineTop + G.lh - (G.barY - Math.round(G.fs * 1.15)));
  smoothScroll(target, retorno ? 460 : 140);
  const caretX = G.padL + (caret.col + 0.5) * G.cw;
  let px;
  if (G.mode === 'a4') {
    px = G.zw * 0.5;
    edSheets.classList.toggle('ret', !!retorno);
    edSheets.style.transform = `translateX(${(px - caretX).toFixed(1)}px)`;
  } else {
    edSheets.style.transform = 'none';
    px = (G.zw - G.w) / 2 + caretX;
  }
  edHead.classList.toggle('ret', !!retorno); edLight.classList.toggle('ret', !!retorno);
  edHead.style.transform = edLight.style.transform = `translateX(${px.toFixed(1)}px)`;
}
let hitT = null;
function strike() {
  if (overview || !G) return;
  clearTimeout(hitT);
  edHead.classList.add('hit');
  hitT = setTimeout(() => edHead.classList.remove('hit'), 70);
}
function smoothScroll(to, dur = 140) {
  cancelAnimationFrame(scrollAnim);
  const from = edScroll.scrollTop, d = to - from;
  if (Math.abs(d) < 1) return;
  if (Math.abs(d) > 600) { edScroll.scrollTop = to; return; }
  const t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / dur); edScroll.scrollTop = from + d * (1 - Math.pow(1 - p, 3)); if (p < 1) scrollAnim = requestAnimationFrame(step); };
  scrollAnim = requestAnimationFrame(step);
}

function shouldCap() {
  if (!S.autocap) return false;
  if (back > 0) return false;
  return /(^|[.!?…]\s+|\n\s*)[¿¡"«(\-—]*$/.test(note.text);
}
/* escribir encima de lo que ya hay (modo máquina real) */
function overstrike(ch) {
  const idx = note.text.length - back;
  back--;
  if (ch === ' ') return false; // el espacio solo avanza el carro
  const old = note.text[idx];
  if (old && old !== ' ' && old !== '\n') { if (!note.over) note.over = {}; (note.over[idx] = note.over[idx] || []).push(old); }
  note.text = note.text.slice(0, idx) + ch + note.text.slice(idx + 1);
  return true;
}
function insert(str, opts = {}) {
  if (!note || overview) return;
  if (str.length > 1 || str.includes('\n')) back = 0;
  const beforeLines = lines.length, beforePages = Math.ceil(lines.length / G.rows);
  let struck = false;
  for (const ch0 of str) {
    let ch = ch0;
    if (!opts.raw && /\p{L}/u.test(ch)) {
      if (shift > 0 || shouldCap()) ch = ch.toUpperCase();
      if (shift === 1) setShift(0);
    }
    if (back > 0) { if (overstrike(ch)) struck = true; }
    else { note.text += ch; if (ch.trim()) struck = true; }
  }
  note.updated = Date.now();
  render();
  if (str.length === 1 && struck) strike();
  const newLine = lines.length > beforeLines;
  if (Math.ceil(lines.length / G.rows) > beforePages && beforeLines > 0) play('cargar_hoja', 0.9);
  if (newLine && !str.includes('\n')) { play('retorno', 0.8); place(true); }
  if (S.campanilla && caret.col === G.cols - 7 && bellLine !== caret.line) { bellLine = caret.line; play('campanilla', 0.8); }
  save();
}
function newline() {
  if (!note || overview) return;
  play('retorno');
  back = 0;
  const before = Math.ceil(lines.length / G.rows);
  note.text += '\n'; note.updated = Date.now();
  render(); place(true);
  if (Math.ceil(lines.length / G.rows) > before) setTimeout(() => play('cargar_hoja', 0.9), 250);
  save();
}
function backspace() {
  if (!note || overview || !note.text) return;
  if (S.real) {
    // como en una máquina: el carro retrocede una letra, sin borrar
    const len = lines.length ? lines[lines.length - 1].length : 0;
    if (back >= len) return;
    play('mayus', 0.6);
    back++; render();
    return;
  }
  play('borrar', 0.8);
  back = 0;
  const i = note.text.length - 1;
  note.text = note.text.slice(0, i);
  if (note.over && note.over[i]) { delete note.over[i]; }
  note.updated = Date.now(); render(); save();
}

function openNote(id, isNew) {
  note = DB.notes.find(n => n.id === id); if (!note) return;
  back = 0;
  overview = false; edScroll.classList.remove('overview'); edSheets.style.zoom = ''; edSheets.style.marginBottom = ''; edSheets.style.transformOrigin = ''; $('#vEditor').classList.remove('sinCinta'); edScroll.style.opacity = 1;
  setShift(0); setLayout('abc');
  $('#vEditor').classList.toggle('ios', S.teclado === 'ios');
  if (S.lampAuto) { const h = new Date().getHours(); S.lampOn = h >= 20 || h < 7; }
  applyLook();
  show('vEditor');
  requestAnimationFrame(() => {
    measure(); render(true);
    edScroll.scrollTop = edScroll.scrollHeight; place();
    if (isNew) { play('cargar_hoja', 0.9); }
    if (S.teclado === 'ios') focusIOS();
  });
}
function closeNote() {
  if (note && !note.text.trim()) DB.notes = DB.notes.filter(n => n !== note);
  note = null; save(true); $('#iosInput').blur(); applyLook();
  renderCaja(); show('vCaja');
}
$('#btnVolver').onclick = closeNote;

/* lámpara */
$('#btnLampara').onclick = () => {
  S.lampOn = !S.lampOn;
  play('lampara', 1); save(); applyLook();
};
$('#btnAspecto').onclick = () => {
  if (!note) return;
  if (!note.look) note.look = { fondo: S.fondo, teclas: S.teclas, hoja: S.hoja };
  if (!note.look.fondo) note.look.fondo = S.fondo;
  lookSheet('Aspecto de esta hoja', note.look, 'Listo', () => { applyLook(); measure(); render(true); edScroll.scrollTop = edScroll.scrollHeight; place(); save(); });
};

/* vista de hoja entera */
let ovT = null;
function setOverview(on) {
  if (!note || on === overview) return;
  edScroll.style.opacity = 0; clearTimeout(ovT);
  ovT = setTimeout(() => { setOverviewNow(on); edScroll.style.transition = 'opacity .3s ' + E_IN; edScroll.style.opacity = 1; setTimeout(() => { edScroll.style.transition = ''; }, 320); }, 160);
}
function setOverviewNow(on) {
  if (!note) return;
  overview = on;
  edScroll.classList.toggle('overview', on);
  $('#vEditor').classList.toggle('sinCinta', on);
  measure();
  edSheets.style.zoom = '';
  edSheets.style.marginBottom = '';
  if (on) {
    // Safari no aplica bien «zoom»: se escala con transform y se corrige el hueco a mano
    const sc = Math.min(1, (G.zw - 28) / G.w, (G.zh - 60) / G.h);
    edSheets.classList.remove('carro', 'ret');
    edSheets.style.width = G.w + 'px';
    render(true);
    edSheets.style.transformOrigin = '0 0';
    edSheets.style.transform = `translateX(${((G.zw - G.w * sc) / 2).toFixed(1)}px) scale(${sc.toFixed(4)})`;
    edSheets.style.marginBottom = (-(edSheets.offsetHeight * (1 - sc))).toFixed(0) + 'px';
    $$('.ed-sheet', edSheets).forEach(x => { x.style.marginLeft = '0'; });
  } else {
    edSheets.style.transform = 'none';
    edSheets.style.transformOrigin = '';
    render(true);
  }
  if (on) { edScroll.scrollTop = 0; hint('Toca dos veces para volver a escribir'); }
  else { edScroll.scrollTop = edScroll.scrollHeight; place(); }
}
function hint(t) { const h = $('#edHint'); h.textContent = t; h.classList.add('on'); clearTimeout(h._t); h._t = setTimeout(() => h.classList.remove('on'), 2200); }
$('#edCount').onclick = () => setOverview(!overview);
let lastTap = 0;
edZone.addEventListener('pointerup', e => {
  const now = Date.now();
  if (now - lastTap < 320) { setOverview(!overview); lastTap = 0; } else lastTap = now;
  if (S.teclado === 'ios' && !overview) focusIOS();
});
edZone.addEventListener('gesturestart', e => e.preventDefault());
edZone.addEventListener('gestureend', e => { if (e.scale < 0.85 && !overview) setOverview(true); else if (e.scale > 1.15 && overview) setOverview(false); });
// si lees hacia arriba, al volver a teclear vuelve al renglón

/* ================= TECLADO KLAK ================= */
const ACC = {
  a: 'áàäâª', e: 'éèëê', i: 'íìïî', o: 'óòöôº', u: 'úùüû', n: 'ñ', c: 'ç', y: 'ÿ',
  '?': '¿', '!': '¡', '.': '…·', '-': '—–', '"': '«»“”', "'": '‘’', '€': '$£¥', '%': '‰'
};
const LAYOUTS = {
  abc: [
    'QWERTYUIOP'.split(''),
    'ASDFGHJKLÑ'.split(''),
    [{ sp: 'shift', t: 'MAYÚS' }, ...'ZXCVBNM'.split(''), { sp: 'del', t: 'BORRAR' }],
    [{ sp: '123', t: '123' }, ',', { sp: 'space' }, '.', { sp: 'ret', t: 'RETORNO' }]
  ],
  num: [
    '1234567890'.split(''),
    ['-', '/', ':', ';', '(', ')', '€', '&', '@', '"'],
    [{ sp: 'sym', t: '#+=' }, '¿', '?', '¡', '!', "'", '%', '*', { sp: 'del', t: 'BORRAR' }],
    [{ sp: 'abc', t: 'ABC' }, ',', { sp: 'space' }, '.', { sp: 'ret', t: 'RETORNO' }]
  ],
  sym: [
    ['[', ']', '{', '}', '#', '^', '+', '=', '_', '\\'],
    ['|', '~', '<', '>', '$', '£', '°', '·', '§', '¨'],
    [{ sp: '123', t: '123' }, '…', '—', '«', '»', '´', '`', '¬', { sp: 'del', t: 'BORRAR' }],
    [{ sp: 'abc', t: 'ABC' }, ',', { sp: 'space' }, '.', { sp: 'ret', t: 'RETORNO' }]
  ]
};
let kbLayout = 'abc', shift = 0, lastShiftTap = 0;
function setLayout(l) {
  kbLayout = l;
  $('#kbRows').innerHTML = LAYOUTS[l].map(row => '<div class="krow">' + row.map(k => {
    if (typeof k === 'string') return `<div class="k" data-c="${esc(k)}"><b>${esc(k)}</b></div>`;
    if (k.sp === 'space') return `<div class="k sp" data-s="space"></div>`;
    return `<div class="k w" data-s="${k.sp}"><b>${k.t}</b></div>`;
  }).join('') + '</div>').join('');
  if (current === 'vEditor' && $('#kbRows').animate) $('#kbRows').animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200, easing: E_IN });
  setShift(shift);
}
function setShift(v) {
  shift = v;
  const k = $('#kbRows [data-s="shift"]');
  if (k) { k.classList.toggle('shiftOn', v === 1); k.classList.toggle('lock', v === 2); }
}
const pop = $('#accentPop');
const active = new Map();
function popShow(keyEl, opts) {
  pop.innerHTML = opts.map((o, i) => `<b class="${i === 0 ? 'sel' : ''}">${esc(o)}</b>`).join('');
  pop.classList.add('on');
  const r = keyEl.getBoundingClientRect(), w = pop.offsetWidth;
  const left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
  pop.style.left = left + 'px'; pop.style.top = (r.top - pop.offsetHeight - 6) + 'px';
  return { left, opts, sel: 0 };
}
function popMove(st, x) {
  const i = Math.max(0, Math.min(st.opts.length - 1, Math.floor((x - st.left - 6) / 40)));
  if (i !== st.sel) { st.sel = i; $$('b', pop).forEach((b, j) => b.classList.toggle('sel', j === i)); }
}
function charFor(c) { return /\p{L}/u.test(c) ? c.toLowerCase() : c; }
function pressSpecial(s) {
  if (s === 'space') { play('espacio'); insert(' '); }
  else if (s === 'ret') newline();
  else if (s === 'del') backspace();
  else if (s === 'shift') {
    play('mayus', 0.7);
    const now = Date.now();
    if (shift === 2) setShift(0);
    else if (now - lastShiftTap < 320) setShift(2);
    else setShift(shift ? 0 : 1);
    lastShiftTap = now;
  }
  else if (s === '123') { play('mayus', 0.5); setLayout('num'); }
  else if (s === 'sym') { play('mayus', 0.5); setLayout('sym'); }
  else if (s === 'abc') { play('mayus', 0.5); setLayout('abc'); }
}
const kbRows = $('#kbRows');
kbRows.addEventListener('pointerdown', e => {
  const key = e.target.closest('.k'); if (!key) return;
  e.preventDefault();
  try { key.setPointerCapture(e.pointerId); } catch (_) {}
  key.classList.add('down');
  const st = { key, timer: null, rep: null, pop: null, deferred: null };
  active.set(e.pointerId, st);
  if (overview) { clearTimeout(ovT); setOverviewNow(false); edScroll.style.opacity = 1; }
  const s = key.dataset.s, c = key.dataset.c;
  if (s) {
    if (s === 'del') {
      pressSpecial('del');
      st.timer = setTimeout(() => { st.rep = setInterval(() => backspace(), S.real ? 140 : 75); }, 450);
    } else pressSpecial(s);
    return;
  }
  play('tecla');
  const base = charFor(c);
  const acc = ACC[base];
  if (acc) {
    st.deferred = base;
    st.timer = setTimeout(() => {
      const up = shift > 0 || (shouldCap() && /\p{L}/u.test(base));
      st.pop = popShow(key, [...acc].map(a => up ? a.toUpperCase() : a));
    }, 380);
  } else insert(base);
});
kbRows.addEventListener('pointermove', e => { const st = active.get(e.pointerId); if (st && st.pop) popMove(st.pop, e.clientX); });
function keyUp(e, cancel) {
  const st = active.get(e.pointerId); if (!st) return;
  active.delete(e.pointerId);
  st.key.classList.remove('down');
  clearTimeout(st.timer); clearInterval(st.rep);
  if (st.pop) {
    pop.classList.remove('on');
    if (!cancel) insert(st.pop.opts[st.pop.sel], { raw: true });
    if (shift === 1) setShift(0);
  } else if (st.deferred && !cancel) insert(st.deferred);
}
kbRows.addEventListener('pointerup', e => keyUp(e, false));
kbRows.addEventListener('pointercancel', e => keyUp(e, true));
kbRows.addEventListener('contextmenu', e => e.preventDefault());

/* teclado físico (iPad, Mac) */
document.addEventListener('keydown', e => {
  if (current !== 'vEditor' || !note || sheetUI.classList.contains('on')) return;
  if (document.activeElement && document.activeElement.id === 'iosInput') return;
  if (e.metaKey || e.ctrlKey || e.altKey && e.key.length !== 1) return;
  if (e.key === 'Dead') return;
  if (e.key === 'Escape') { e.preventDefault(); if (overview) setOverview(false); else closeNote(); }
  else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
  else if (e.key === 'Enter') { e.preventDefault(); newline(); }
  else if (e.key === ' ') { e.preventDefault(); play('espacio'); insert(' ', { raw: true }); }
  else if (e.key.length === 1) { e.preventDefault(); play('tecla'); insert(e.key, { raw: true }); }
});

/* teclado de iOS */
const iosIn = $('#iosInput');
function focusIOS() { iosIn.value = ''; iosIn.focus({ preventScroll: true }); }
iosIn.addEventListener('beforeinput', e => {
  e.preventDefault();
  const t = e.inputType;
  if (t === 'insertText' || t === 'insertReplacementText' || t === 'insertFromPaste') {
    const d = e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
    if (!d) return;
    if (d === ' ') play('espacio'); else play('tecla');
    insert(d.replace(/\r/g, ''));
  } else if (t === 'insertLineBreak' || t === 'insertParagraph') newline();
  else if (t === 'deleteContentBackward') backspace();
});
iosIn.addEventListener('input', () => { iosIn.value = ''; });
if (window.visualViewport) {
  visualViewport.addEventListener('resize', () => {
    if (current !== 'vEditor' || S.teclado !== 'ios') { $('#vEditor').style.height = ''; return; }
    $('#vEditor').style.height = visualViewport.height + 'px';
    measure(); render(true);
  });
}

/* ================= EXPORTAR ================= */
let EXP = { size: 'a5', marg: 'normal', tinta: 'como' };
$('#btnCompartir').onclick = () => {
  if (!note) return;
  EXP.size = V('hoja') === 'a4' ? 'a4' : 'a5';
  const t = titleOf(note.text);
  const segE = (k, opts) => `<div class="seg"><i class="seg-pill"></i>` + opts.map(([v, l]) => `<button data-e="${k}" data-v="${v}" class="${EXP[k] === v ? 'on' : ''}">${l}</button>`).join('') + '</div>';
  openSheet(`<div class="sh-t">Exportar hoja</div>
    <div class="prev"><div>${esc(note.text.slice(0, 600))}</div></div>
    <div class="opt"><span>Nombre</span><input class="field" id="exNombre" value="${esc(t)}"></div>
    <div class="opt"><span>Tamaño</span>${segE('size', [['a4', 'A4'], ['a5', 'A5']])}</div>
    <div class="opt"><span>Márgenes</span>${segE('marg', [['normal', 'Normal'], ['amplio', 'Amplio']])}</div>
    <div class="opt"><span>Tinta</span>${segE('tinta', [['como', 'Como está'], ['limpia', 'Limpia']])}</div>
    <button class="bigbtn" id="exPdf">Guardar PDF</button>
    <div class="row2"><button class="ghost" id="exPrint">Imprimir</button><button class="ghost" id="exCopy">Copiar texto</button></div>
    ${navigator.share ? '<div class="row2"><button class="ghost" id="exShare">Compartir texto</button></div>' : ''}`);
  $$('[data-e]', sheetUI).forEach(b => b.onclick = () => { EXP[b.dataset.e] = b.dataset.v; segPick(b); });
  $$('.seg', sheetUI).forEach(sg => placePill(sg));
  const go = () => { const name = $('#exNombre').value.trim() || t; closeSheet(); setTimeout(() => printNote(note, name), 350); };
  $('#exPdf').onclick = go; $('#exPrint').onclick = go;
  $('#exCopy').onclick = () => {
    (navigator.clipboard ? navigator.clipboard.writeText(note.text) : Promise.reject()).then(() => toast('Texto copiado'), () => toast('No se ha podido copiar'));
  };
  const sh = $('#exShare'); if (sh) sh.onclick = () => navigator.share({ title: titleOf(note.text), text: note.text }).catch(() => {});
};
function printNote(n, name) {
  const dims = EXP.size === 'a4' ? [210, 297] : [148, 210];
  const cols = EXP.size === 'a4' ? 62 : 35;
  const padX = EXP.marg === 'amplio' ? 0.12 : 0.075, padY = EXP.marg === 'amplio' ? 0.12 : 0.09;
  const [W, H] = dims;
  const fs = W * (1 - 2 * padX) / (cols * 0.6), lh = fs * 1.5, padT = W * padY;
  const rows = Math.floor((H - 2 * padT) / lh);
  const L = layout(n.text, cols);
  const k = EXP.tinta === 'limpia' ? 0 : (TINTA[V('tinta')] || 0.75) * 0.6;
  const bg = '#fff';
  let html = '';
  for (let p = 0; p < Math.max(1, Math.ceil(L.length / rows)); p++) {
    let t = '';
    for (let r = p * rows; r < Math.min(L.length, (p + 1) * rows); r++) {
      t += '<div style="height:' + lh + 'mm;line-height:' + lh + 'mm">' +
        (L[r].map(([ch, idx]) => k ? cellHTML(n, ch, idx, k).replace('<span', `<span data-w`) : (ch === ' ' ? '<span data-w> </span>' : `<span data-w>${esc(ch)}</span>`)).join('') || ' ') + '</div>';
    }
    html += `<div class="pr-page" style="width:${W}mm;height:${H}mm;${bg ? 'background:' + bg : ''}"><div class="pr-text" style="position:absolute;left:${W * padX}mm;top:${padT}mm;font-size:${fs}mm;--cw:${(fs * 0.6).toFixed(3)}mm;--lh:${lh}mm">${t}</div></div>`;
  }
  $('#printArea').innerHTML = html;
  $('#printPage').textContent = `@page{size:${EXP.size === 'a4' ? 'A4' : 'A5'};margin:0}`;
  const old = document.title; document.title = name;
  setTimeout(() => { window.print(); setTimeout(() => { document.title = old; }, 1000); }, 60);
}

/* ================= INICIO ================= */
applyLook();
renderCaja(false);
/* animación de inicio: siempre al abrir (se salta tocando); con «Reducir movimiento», un fundido */
(function intro() {
  const el = $('#kIntro'); if (!el) return;
  const full = !RM && !(window.__klakSinIntro);
  let done = false;
  const finish = cls => {
    if (done) return; done = true;
    el.classList.add(cls); renderCaja(true);
    setTimeout(() => el.remove(), cls === 'out' ? 480 : 380);
  };
  if (!full) { requestAnimationFrame(() => finish('quick')); return; }
  const tA = [], img = el.querySelector('img');
  const start = () => {
    requestAnimationFrame(() => el.classList.add('go'));
    tA.push(setTimeout(() => { if (actx && actx.state === 'running') { play('tecla'); setTimeout(() => play('lampara'), 110); } }, 750));
    tA.push(setTimeout(() => finish('out'), 2100));
  };
  if (img.complete) start(); else { img.onload = start; img.onerror = start; setTimeout(() => { if (!el.classList.contains('go')) start(); }, 600); }
  el.addEventListener('pointerdown', () => { tA.forEach(clearTimeout); finish('skip'); }, { once: true });
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.KLAK = { DB, openNote, insert, newline, backspace, setOverview, render, get back() { return back; } };
})();
