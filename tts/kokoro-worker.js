// Voci neurali dentro il browser: fonemi con eSpeak NG (WebAssembly), audio con Kokoro-82M o Piper (onnxruntime-web).
// Tutto gira sul dispositivo: nessun server, nessun costo. Ogni voce si scarica solo quando la scegli.
import * as ort from './ort/ort.wasm.min.mjs';
import ESpeakModule from './espeak/espeak-ng.js';

const BASE = new URL('./', import.meta.url);
const CACHE = 'cerca-voce-kokoro-v1';
let espeak = null, espeakLang = '', vocab = null, ready = null, threads = 1;
let kokoro = null, kokoroP = null;
const piper = new Map();          // id -> Promise<{session, cfg}>
const styles = new Map();
let gen = 0, queue = [], running = false;

const post = (m, t) => self.postMessage(m, t || []);

async function getBytes(path, onChunk){
  const url = new URL(path, BASE).href;
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) {}
  if (cache){
    try { const hit = await cache.match(url); if (hit){ const b = new Uint8Array(await hit.arrayBuffer()); onChunk && onChunk(b.length, true); return b; } } catch (e) {}
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('download ' + path + ': ' + res.status);
  let bytes;
  if (res.body && res.body.getReader){
    const rd = res.body.getReader(), parts = []; let n = 0;
    for (;;){ const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; onChunk && onChunk(value.length, false); }
    bytes = new Uint8Array(n); let o = 0; for (const p of parts){ bytes.set(p, o); o += p.length; }
  } else { bytes = new Uint8Array(await res.arrayBuffer()); onChunk && onChunk(bytes.length, false); }
  if (cache){ try { await cache.put(url, new Response(bytes.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) {} }
  return bytes;
}

// scarica un modello diviso in parti (manifest.json + part0..N), con l'avanzamento
async function getModel(dir, label){
  const man = await (await fetch(new URL(dir + '/manifest.json', BASE))).json();
  let loaded = 0;
  const prog = n => { loaded += n; post({ type: 'progress', what: label, loaded, total: man.size }); };
  const parts = [];
  for (const p of man.parts) parts.push(await getBytes(dir + '/' + p, prog));
  const model = new Uint8Array(man.size); let o = 0; for (const p of parts){ model.set(p, o); o += p.length; }
  return model;
}

async function init(opt){
  const t0 = performance.now();
  const m = await ESpeakModule({ locateFile: f => new URL('espeak/' + f, BASE).href });
  espeak = new m.eSpeakNGWorker();
  espeak.set_voice('it'); espeakLang = 'it';
  vocab = await (await fetch(new URL('vocab.json', BASE))).json();
  ort.env.wasm.wasmPaths = new URL('ort/', BASE).href;
  threads = self.crossOriginIsolated ? Math.max(1, Math.min(opt.threads || 4, 8)) : 1;
  ort.env.wasm.numThreads = threads;
  post({ type: 'ready', ms: Math.round(performance.now() - t0), threads, isolated: !!self.crossOriginIsolated });
}

const sessOpt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
function ensureKokoro(){
  if (!kokoroP) kokoroP = (async () => {
    const model = await getModel('model', 'Kokoro');
    kokoro = await ort.InferenceSession.create(model, sessOpt);
    post({ type: 'loaded', what: 'Kokoro' });
    return kokoro;
  })().catch(e => { kokoroP = null; throw e; });
  return kokoroP;
}
function ensurePiper(id, label){
  if (!piper.has(id)){
    // tiene in memoria al massimo due voci Piper oltre a Kokoro
    if (piper.size >= 2){ const [old] = piper.keys(); piper.get(old).then(v => { try { v.session.release(); } catch (e) {} }).catch(() => {}); piper.delete(old); }
    const p = (async () => {
      const dir = 'piper/' + id;
      const cfg = await (await fetch(new URL(dir + '/config.json', BASE))).json();
      const model = await getModel(dir, label || id);
      const session = await ort.InferenceSession.create(model, sessOpt);
      post({ type: 'loaded', what: label || id });
      return { session, cfg };
    })();
    p.catch(() => piper.delete(id));
    piper.set(id, p);
  }
  return piper.get(id);
}

async function style(spec){
  const key = JSON.stringify(spec);
  if (styles.has(key)) return styles.get(key);
  const load = async n => { const b = await getBytes('voices/' + n + '.bin'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
  const a = await load(spec.a);
  let s = a;
  if (spec.b && spec.w > 0){
    const b = await load(spec.b), w = Math.min(1, Math.max(0, spec.w));
    s = new Float32Array(a.length); for (let i = 0; i < a.length; i++) s[i] = a[i] * (1 - w) + b[i] * w;
  }
  styles.set(key, s);
  return s;
}

function phonemize(segs){
  // segs: [{t:'it'|'en'|'ipa', s}]
  let out = '';
  for (const g of segs){
    if (g.t === 'ipa'){ out += ' ' + g.s + ' '; continue; }
    const lang = g.t === 'en' ? 'en-us' : 'it';
    if (lang !== espeakLang){ espeak.set_voice(lang); espeakLang = lang; }
    const r = espeak.synthesize_ipa(g.s);
    out += ' ' + String(r && r.ipa || '').replace(/_/g, '').replace(/\n/g, ' ') + ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

async function synthKokoro(ph, sty, speed){
  const ids = [];
  for (const ch of ph){ const id = vocab[ch]; if (id !== undefined) ids.push(id); }
  if (!ids.length) return new Float32Array(0);
  const n = Math.min(ids.length, 508), row = n - 1;
  const st = sty.slice(row * 256, row * 256 + 256);
  const tok = new ort.Tensor('int64', BigInt64Array.from([0, ...ids.slice(0, n), 0].map(BigInt)), [1, n + 2]);
  const out = await kokoro.run({ tokens: tok, style: new ort.Tensor('float32', st, [1, 256]), speed: new ort.Tensor('float32', new Float32Array([speed]), [1]) });
  const a = out.audio || out[Object.keys(out)[0]];
  return new Float32Array(a.data);
}

// --- voci che leggono lettere invece di fonemi (Coqui VITS, MMS): testo semplificato e numeri in parole
const UNITA = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const DECINE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
function num(n){
  if (n < 20) return UNITA[n];
  if (n < 100){ let d = DECINE[Math.floor(n / 10)], u = n % 10; if (u === 1 || u === 8) d = d.slice(0, -1); return d + (u ? UNITA[u] : ''); }
  if (n < 1000){ const c = Math.floor(n / 100), r = n % 100; let h = (c > 1 ? UNITA[c] : '') + 'cento'; if (r && Math.floor(r / 10) === 8) h = h.slice(0, -1); return h + (r ? num(r) : ''); }
  if (n < 1e6){ const k = Math.floor(n / 1000), r = n % 1000; return (k > 1 ? num(k) + 'mila' : 'mille') + (r ? num(r) : ''); }
  if (n < 1e9){ const m = Math.floor(n / 1e6), r = n % 1e6; return (m > 1 ? num(m) + ' milioni' : 'un milione') + (r ? ' ' + num(r) : ''); }
  return String(n).split('').map(c => UNITA[+c]).join(' ');
}
function numbersToWords(s){
  return s.replace(/\d+(?:[.,]\d+)?/g, t => {
    const m = t.match(/^(\d+)[.,](\d+)$/);
    if (m){ if (t.includes('.') && m[2].length === 3) return num(+(m[1] + m[2])); return num(+m[1]) + ' virgola ' + (m[2].length > 2 ? m[2].split('').map(c => UNITA[+c]).join(' ') : num(+m[2])); }
    return t.length > 9 || (t.length > 1 && t[0] === '0') ? t.split('').map(c => UNITA[+c]).join(' ') : num(+t);
  });
}
const IPA2IT = [[/[ˈˌː]/g, ''], [/tʃ/g, 'ci'], [/dʒ/g, 'gi'], [/ʃ/g, 'sci'], [/ts/g, 'z'], [/dz/g, 'z'], [/[ɛeə]/g, 'e'], [/[ɔo]/g, 'o'], [/[ɾɹ]/g, 'r'], [/ʎ/g, 'gli'], [/ɲ/g, 'gn'], [/ŋ/g, 'n'], [/[ʊ]/g, 'u'], [/[ɪ]/g, 'i'], [/[æɜʌɐ]/g, 'a'], [/j/g, 'i'], [/w/g, 'u'], [/ɡ/g, 'g']];
function ipaToText(s){ for (const [re, r] of IPA2IT) s = s.replace(re, r); return s; }
function toText(segs, map){
  let s = segs.map(g => g.t === 'ipa' ? ipaToText(g.s) : g.s).join(' ').toLowerCase();
  s = numbersToWords(s);
  let out = '';
  for (const ch of s){
    if (map[ch]){ out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += map[base] ? base : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

async function synthPiper(ph, v, speed){
  const map = v.cfg.phoneme_id_map, inf = v.cfg.inference || {};
  const pad = map['_'] || [0], ids = [...(map['^'] || [1]), ...pad];
  for (const ch of (v.cfg.phoneme_type === 'text' ? ph : ph.normalize('NFD'))){ const id = map[ch]; if (id){ ids.push(...id, ...pad); } }
  ids.push(...(map['$'] || [2]));
  if (ids.length <= 3) return new Float32Array(0);
  const T = (a, d) => new ort.Tensor('int64', BigInt64Array.from(a.map(BigInt)), d);
  let feeds;
  if (v.session.inputNames.includes('input_ids')){
    feeds = { input_ids: T(ids, [1, ids.length]) };
    if (v.session.inputNames.includes('attention_mask')) feeds.attention_mask = T(ids.map(() => 1), [1, ids.length]);
  } else {
    const scales = new Float32Array([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / speed, inf.noise_w ?? 0.8]);
    feeds = { input: T(ids, [1, ids.length]), input_lengths: T([ids.length], [1]), scales: new ort.Tensor('float32', scales, [3]) };
  }
  const out = await v.session.run(feeds);
  const a = out.output || out.waveform || out[Object.keys(out)[0]];
  return new Float32Array(a.data);
}

async function pump(){
  if (running) return; running = true;
  try {
    while (queue.length){
      const job = queue.shift();
      if (job.gen < gen) continue;
      const v = job.voice || {};
      let synth, sr, textMap = null, fixedRate = false;
      try {
        if (v.engine === 'piper'){
          const pv = await ensurePiper(v.id, v.label);
          sr = (pv.cfg.audio && pv.cfg.audio.sample_rate) || 22050;
          synth = ph => synthPiper(ph, pv, job.speed);
          if (pv.cfg.phoneme_type === 'text') textMap = pv.cfg.phoneme_id_map;
          fixedRate = pv.session.inputNames.includes('input_ids');
        } else {
          await ensureKokoro();
          const sty = await style(v);
          sr = 24000;
          synth = ph => synthKokoro(ph, sty, job.speed);
        }
      } catch (e) {
        post({ type: 'error', id: job.id, voiceError: true, message: String(e && e.message || e) });
        continue;
      }
      for (let k = 0; k < job.clauses.length; k++){
        if (job.gen < gen) break;
        const c = job.clauses[k];
        const t0 = performance.now();
        const ph = (textMap ? toText(c.segs, textMap) : phonemize(c.segs)) + (c.mark || '');
        const pcm = c.segs.length ? await synth(ph) : new Float32Array(0);
        if (job.gen < gen) break;
        post({ type: 'audio', id: job.id, k, last: k === job.clauses.length - 1, pcm, sr, fixedRate, pause: c.pause || 0, ph: job.debug ? ph : undefined, ms: Math.round(performance.now() - t0) }, [pcm.buffer]);
      }
    }
  } catch (e) {
    post({ type: 'error', message: String(e && e.message || e) });
  } finally { running = false; if (queue.length) pump(); }
}

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'init'){
    if (!ready) ready = init(m).catch(err => { ready = null; post({ type: 'error', fatal: true, message: String(err && err.message || err) }); });
    return;
  }
  if (m.type === 'cancel'){ gen = Math.max(gen, m.gen); queue = queue.filter(j => j.gen >= gen); return; }
  if (m.type === 'preload'){
    await ready;
    try { if (m.voice && m.voice.engine === 'piper') await ensurePiper(m.voice.id, m.voice.label); else { await ensureKokoro(); if (m.voice) await style(m.voice); } }
    catch (err) { post({ type: 'error', voiceError: true, message: String(err && err.message || err) }); }
    return;
  }
  if (m.type === 'speak'){
    if (!ready){ post({ type: 'error', message: 'non inizializzato' }); return; }
    await ready;
    if (m.gen < gen) return;
    queue.push(m); pump();
    return;
  }
  if (m.type === 'phon'){
    await ready; post({ type: 'phon', id: m.id, ph: phonemize(m.segs) });
  }
};
