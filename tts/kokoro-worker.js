// Voce Kokoro dentro il browser: fonemi con eSpeak NG (WebAssembly), audio con il modello Kokoro-82M (onnxruntime-web).
// Tutto gira sul dispositivo: nessun server, nessun costo.
import * as ort from './ort/ort.wasm.min.mjs';
import ESpeakModule from './espeak/espeak-ng.js';

const BASE = new URL('./', import.meta.url);
const CACHE = 'cerca-voce-kokoro-v1';
const SR = 24000;
let session = null, espeak = null, espeakLang = '', vocab = null, ready = null;
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

async function init(opt){
  const t0 = performance.now();
  const man = await (await fetch(new URL('model/manifest.json', BASE))).json();
  let loaded = 0, fromCache = true;
  const prog = (n, cached) => { loaded += n; if (!cached) fromCache = false; post({ type: 'progress', loaded, total: man.size }); };
  const espeakP = (async () => {
    const m = await ESpeakModule({ locateFile: f => new URL('espeak/' + f, BASE).href });
    espeak = new m.eSpeakNGWorker();
    espeak.set_voice('it'); espeakLang = 'it';
  })();
  vocab = await (await fetch(new URL('vocab.json', BASE))).json();
  const parts = [];
  for (const p of man.parts) parts.push(await getBytes('model/' + p, prog));
  const model = new Uint8Array(man.size); let o = 0; for (const p of parts){ model.set(p, o); o += p.length; }
  ort.env.wasm.wasmPaths = new URL('ort/', BASE).href;
  const threads = self.crossOriginIsolated ? Math.max(1, Math.min(opt.threads || 4, 8)) : 1;
  ort.env.wasm.numThreads = threads;
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  await espeakP;
  post({ type: 'ready', ms: Math.round(performance.now() - t0), threads, fromCache, isolated: !!self.crossOriginIsolated });
}

async function style(spec){
  const key = JSON.stringify(spec);
  if (styles.has(key)) return styles.get(key);
  const load = async n => new Float32Array((await getBytes('voices/' + n + '.bin')).buffer);
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

function tokens(ph){
  const ids = [];
  for (const ch of ph){ const id = vocab[ch]; if (id !== undefined) ids.push(id); }
  return ids.slice(0, 508);
}

async function synth(ph, sty, speed){
  const ids = tokens(ph);
  if (!ids.length) return new Float32Array(0);
  const row = Math.min(ids.length, 510) - 1;
  const st = sty.slice(row * 256, row * 256 + 256);
  const tok = new ort.Tensor('int64', BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]);
  const feeds = { tokens: tok, style: new ort.Tensor('float32', st, [1, 256]), speed: new ort.Tensor('float32', new Float32Array([speed]), [1]) };
  const out = await session.run(feeds);
  const a = out.audio || out[Object.keys(out)[0]];
  return new Float32Array(a.data);
}

async function pump(){
  if (running) return; running = true;
  try {
    while (queue.length){
      const job = queue.shift();
      if (job.gen < gen) continue;
      const sty = await style(job.voice);
      for (let k = 0; k < job.clauses.length; k++){
        if (job.gen < gen) break;
        const c = job.clauses[k];
        const t0 = performance.now();
        const ph = phonemize(c.segs) + (c.mark || '');
        const pcm = c.segs.length ? await synth(ph, sty, job.speed) : new Float32Array(0);
        if (job.gen < gen) break;
        post({ type: 'audio', id: job.id, k, last: k === job.clauses.length - 1, pcm, pause: c.pause || 0, ph: job.debug ? ph : undefined, ms: Math.round(performance.now() - t0) }, [pcm.buffer]);
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
