// Meridian Tools for Mate: media converter and compressor. Everything runs on the device; nothing is uploaded.
// Loaded on demand by the Media tab. Engines (vendor/) are loaded only when a job needs them.
const V = new URL('./vendor/', import.meta.url).href;
const once = (fn) => { let p = null; return () => (p = p || fn().catch((e) => { p = null; throw e; })); };

/* ---------- Engines ---------- */
const loadMB = once(() => import(V + 'mediabunny.mjs'));
const loadMp3 = once(async () => { const MB = await loadMB(); if (!(await MB.canEncodeAudio('mp3'))) { const m = await import(V + 'mp3-encoder.mjs'); m.registerMp3Encoder(); } return MB; });
const loadGif = once(() => import(V + 'gifenc.mjs'));
const loadHeic = once(() => import(V + 'heic-to.min.js'));
const loadPdfjs = once(async () => { const p = await import(V + 'pdf.min.mjs'); p.GlobalWorkerOptions.workerSrc = V + 'pdf.worker.min.mjs'; return p; });
const loadPdfLib = once(() => new Promise((res, rej) => { if (window.PDFLib) return res(window.PDFLib); const s = document.createElement('script'); s.src = V + 'pdf-lib.min.js'; s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error('Could not load the PDF engine')); document.head.appendChild(s); }));
const PDFJS_OPTS = () => ({ cMapUrl: V + 'cmaps/', cMapPacked: true, standardFontDataUrl: V + 'standard_fonts/', wasmUrl: V + 'wasm/', iccUrl: V + 'iccs/', isEvalSupported: false });

export const VENDOR_FILES = ['mediabunny.mjs', 'mp3-encoder.mjs', 'gifenc.mjs', 'heic-to.min.js', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'pdf-lib.min.js'];
// Fetch every engine once so the service worker keeps them for offline use.
export async function warmOffline(onProgress) {
  let n = 0;
  for (const f of VENDOR_FILES) { try { const r = await fetch(V + f); await r.arrayBuffer(); } catch (e) {} n++; if (onProgress) onProgress(n / VENDOR_FILES.length); }
  return true;
}

/* ---------- Helpers ---------- */
export const fmtBytes = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
export const fmtTime = (s) => { if (!isFinite(s)) return '-'; s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + (x < 10 ? '0' : '') + x.toFixed(x < 10 && s < 60 ? 1 : 0).replace(/\.0$/, ''); };
const baseName = (n) => String(n || 'file').replace(/\.[^.]+$/, '');
export const extOf = (n) => (/\.([^.]+)$/.exec(String(n || '')) || [, ''])[1].toLowerCase();
const abortErr = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });
const check = (sig) => { if (sig && sig.aborted) throw abortErr(); };
const tick = () => new Promise((r) => setTimeout(r, 0));
function canvasBlob(c, type, q) { return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), type, q)); }
export function kindOf(f) {
  const t = (f.type || '').toLowerCase(), e = extOf(f.name);
  if (t === 'application/pdf' || e === 'pdf') return 'pdf';
  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'avif', 'tif', 'tiff'].includes(e)) return 'image';
  if (t.startsWith('video/') || ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', '3gp', 'ts', 'mts'].includes(e)) return 'video';
  if (t.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'amr', 'wma'].includes(e)) return 'audio';
  return 'other';
}

/* ---------- ZIP (stored, files are already compressed) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export async function zipFiles(items) {
  const enc = new TextEncoder(); const parts = [], central = []; let off = 0; const seen = new Map();
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const it of items) {
    let name = it.name; const k = seen.get(name) || 0; seen.set(name, k + 1); if (k) name = baseName(name) + ' (' + (k + 1) + ')' + (extOf(name) ? '.' + extOf(name) : '');
    const data = new Uint8Array(await it.blob.arrayBuffer()); const nm = enc.encode(name); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, nm, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, nm); off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((s, b) => s + b.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, items.length, true); e.setUint16(10, items.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

/* ---------- Photos ---------- */
export async function decodeImage(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    const e2 = extOf(file.name);
    if (e2 === 'heic' || e2 === 'heif' || /hei[cf]/i.test(file.type)) { const H = await loadHeic(); return H.heicTo({ blob: file, type: 'bitmap' }); }
    // last try through an <img> element (handles some formats createImageBitmap rejects)
    const url = URL.createObjectURL(file);
    try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image format cannot be read on this device')); i.src = url; }); return await createImageBitmap(im); }
    finally { URL.revokeObjectURL(url); }
  }
}
let webpOK = null;
async function canWebp() { if (webpOK != null) return webpOK; const c = document.createElement('canvas'); c.width = c.height = 2; try { const b = await canvasBlob(c, 'image/webp', 0.8); webpOK = b.type === 'image/webp'; } catch (e) { webpOK = false; } return webpOK; }
const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
const EXT = { jpeg: 'jpg', webp: 'webp', png: 'png' };
function drawScaled(bmp, max, flat) {
  let w = bmp.width, h = bmp.height; if (max && Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (flat) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
  x.imageSmoothingQuality = 'high';
  // Step down large reductions for a sharper result
  let src = bmp, sw = bmp.width, sh = bmp.height;
  while (sw / 2 > w * 1.05 && sh / 2 > h * 1.05) { const t = document.createElement('canvas'); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2); const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height; }
  x.drawImage(src, 0, 0, w, h); return c;
}
// opts: { fmt: 'jpeg'|'webp'|'png'|'same', q: 0..1, max: px or 0, targetKB: number or 0 }
export async function processImage(file, opts) {
  const bmp = await decodeImage(file);
  let fmt = opts.fmt === 'same' ? ({ png: 'png', webp: 'webp' }[extOf(file.name)] || 'jpeg') : opts.fmt;
  if (fmt === 'webp' && !(await canWebp())) fmt = 'jpeg';
  const flat = fmt === 'jpeg'; let max = opts.max || 0; let q = opts.q || 0.82; let c = drawScaled(bmp, max, flat); let blob;
  const target = (opts.targetKB || 0) * 1024;
  if (target && fmt !== 'png') {
    let lo = 0.3, hi = 0.95, best = null;
    for (let round = 0; round < 6; round++) {
      lo = 0.3; hi = 0.95; best = null;
      for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; const b = await canvasBlob(c, MIME[fmt], mid); if (b.size <= target) { best = b; lo = mid; } else hi = mid; }
      if (best) { blob = best; break; }
      const cur = Math.max(c.width, c.height); c = drawScaled(bmp, Math.round(cur * 0.8), flat);
    }
    if (!blob) blob = await canvasBlob(c, MIME[fmt], 0.3);
  } else if (target && fmt === 'png') {
    blob = await canvasBlob(c, 'image/png');
    for (let i = 0; i < 8 && blob.size > target; i++) { c = drawScaled(bmp, Math.round(Math.max(c.width, c.height) * 0.8), false); blob = await canvasBlob(c, 'image/png'); }
  } else blob = await canvasBlob(c, MIME[fmt], q);
  if (bmp.close) bmp.close();
  // Never hand back something bigger than the original when nothing else was asked for
  const sameFmt = MIME[fmt] === file.type || (fmt === 'jpeg' && /jpe?g/.test(extOf(file.name)));
  const resized = max && c.width < (opts._ow || Infinity);
  let kept = false;
  if (blob.size >= file.size && sameFmt && !target && !max) { blob = file; kept = true; }
  return { blob, name: baseName(file.name) + '.' + EXT[fmt], w: c.width, h: c.height, kept, fmt, resized };
}
export async function imageInfo(file) { try { const b = await decodeImage(file); const r = { w: b.width, h: b.height }; if (b.close) b.close(); return r; } catch (e) { return null; } }

// Photos into one PDF. page: 'a4' | 'letter' | 'fit'; files may be images or {blob,name}
export async function imagesToPdf(items, { page = 'a4', margin = 18, q = 0.85, max = 2400 } = {}, onProgress) {
  const PL = await loadPdfLib(); const doc = await PL.PDFDocument.create(); doc.setProducer('Meridian Tools for Mate by Tango Juliet Dev');
  for (let i = 0; i < items.length; i++) {
    const f = items[i].blob || items[i]; const bmp = await decodeImage(f); const c = drawScaled(bmp, max, true); if (bmp.close) bmp.close();
    const jpg = await doc.embedJpg(new Uint8Array(await (await canvasBlob(c, 'image/jpeg', q)).arrayBuffer()));
    let W, H; if (page === 'fit') { W = c.width * 0.75; H = c.height * 0.75; } else { const [a, b] = page === 'letter' ? [612, 792] : [595.28, 841.89]; const land = c.width > c.height; W = land ? b : a; H = land ? a : b; }
    const pg = doc.addPage([W, H]); const m = page === 'fit' ? 0 : margin; const k = Math.min((W - 2 * m) / c.width, (H - 2 * m) / c.height); const w = c.width * k, h = c.height * k;
    pg.drawImage(jpg, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h }); c.width = c.height = 0;
    if (onProgress) onProgress((i + 1) / items.length); await tick();
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

/* ---------- PDF ---------- */
const closePdf = (d) => { try { if (d.loadingTask) d.loadingTask.destroy(); else if (d.destroy) d.destroy(); } catch (e) {} };
async function openPdf(file, password) { const P = await loadPdfjs(); return P.getDocument({ ...PDFJS_OPTS(), data: new Uint8Array(await file.arrayBuffer()), password }).promise; }
export async function pdfInfo(file) { try { const d = await openPdf(file); const n = d.numPages; const p = await d.getPage(1); const v = p.getViewport({ scale: 1 }); closePdf(d); return { pages: n, w: v.width, h: v.height }; } catch (e) { return { err: e && e.name === 'PasswordException' ? 'Password protected' : 'Could not read this PDF' }; } }
async function rasterPdf(pdf, dpi, q, onProgress, sig) {
  const PL = await loadPdfLib(); const out = await PL.PDFDocument.create(); out.setProducer('Meridian Tools for Mate by Tango Juliet Dev');
  for (let i = 1; i <= pdf.numPages; i++) {
    check(sig); const pg = await pdf.getPage(i); const v1 = pg.getViewport({ scale: 1 });
    const scale = Math.min(dpi / 72, Math.sqrt(30e6 / (v1.width * v1.height))); const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: vp }).promise;
    const jpg = await out.embedJpg(new Uint8Array(await (await canvasBlob(c, 'image/jpeg', q)).arrayBuffer())); c.width = c.height = 0;
    const p = out.addPage([v1.width, v1.height]); p.drawImage(jpg, { x: 0, y: 0, width: v1.width, height: v1.height });
    pg.cleanup(); if (onProgress) onProgress(i / pdf.numPages); await tick();
  }
  return out.save({ useObjectStreams: true });
}
// mode: 'lossless' | 'balanced' | 'strong' | 'extreme' | 'target' (targetMB)
const PDF_LEVELS = { balanced: [150, 0.78], strong: [110, 0.68], extreme: [80, 0.55] };
export async function compressPdf(file, { mode = 'balanced', targetMB = 0 } = {}, onProgress, sig) {
  const orig = file.size; let bytes = null; let note = '';
  if (mode === 'lossless') {
    const PL = await loadPdfLib(); const d = await PL.PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false, ignoreEncryption: true });
    bytes = await d.save({ useObjectStreams: true }); if (onProgress) onProgress(1);
  } else {
    const pdf = await openPdf(file);
    try {
      if (mode === 'target') {
        const goal = targetMB * 1048576; const steps = [[150, 0.75], [130, 0.68], [110, 0.6], [96, 0.55], [80, 0.5], [72, 0.42], [60, 0.38]];
        for (let s = 0; s < steps.length; s++) { bytes = await rasterPdf(pdf, steps[s][0], steps[s][1], (f) => onProgress && onProgress((s + f) / steps.length), sig); if (bytes.length <= goal) break; }
        if (bytes.length > goal) note = 'Smallest possible is ' + fmtBytes(bytes.length) + '.';
      } else { const [dpi, q] = PDF_LEVELS[mode] || PDF_LEVELS.balanced; bytes = await rasterPdf(pdf, dpi, q, onProgress, sig); }
    } finally { closePdf(pdf); }
  }
  if (bytes.length >= orig) return { blob: file, name: file.name, kept: true, note: 'This PDF is already as small as it gets at this level. The original is kept.' };
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: baseName(file.name) + '-compressed.pdf', note: (mode === 'lossless' ? '' : 'Pages are saved as images, so text is no longer selectable. ') + note };
}
export async function pdfToImages(file, { dpi = 150, fmt = 'jpeg', q = 0.85 } = {}, onProgress, sig) {
  const pdf = await openPdf(file); const out = []; const n = pdf.numPages; const pad = String(n).length;
  try {
    for (let i = 1; i <= n; i++) {
      check(sig); const pg = await pdf.getPage(i); const v1 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: Math.min(dpi / 72, Math.sqrt(36e6 / (v1.width * v1.height))) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: vp }).promise; let f = fmt; if (f === 'webp' && !(await canWebp())) f = 'jpeg';
      out.push({ blob: await canvasBlob(c, MIME[f], q), name: baseName(file.name) + '-page-' + String(i).padStart(pad, '0') + '.' + EXT[f] }); c.width = c.height = 0; pg.cleanup();
      if (onProgress) onProgress(i / n); await tick();
    }
  } finally { closePdf(pdf); }
  return out;
}
export async function mergePdfs(files, onProgress) {
  const PL = await loadPdfLib(); const out = await PL.PDFDocument.create(); out.setProducer('Meridian Tools for Mate by Tango Juliet Dev');
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; const k = kindOf(f);
    if (k === 'pdf') { const d = await PL.PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { ignoreEncryption: true }); const pages = await out.copyPages(d, d.getPageIndices()); pages.forEach((p) => out.addPage(p)); }
    else if (k === 'image') { const one = await imagesToPdf([f]); const d = await PL.PDFDocument.load(new Uint8Array(await one.arrayBuffer())); const [p] = await out.copyPages(d, [0]); out.addPage(p); }
    if (onProgress) onProgress((i + 1) / files.length);
  }
  return new Blob([await out.save({ useObjectStreams: true })], { type: 'application/pdf' });
}

/* ---------- Video and audio ---------- */
export async function probeMedia(file) {
  const MB = await loadMB(); const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(file) });
  try {
    const dur = await input.computeDuration(); const v = await input.getPrimaryVideoTrack(); const a = await input.getPrimaryAudioTrack();
    const r = { duration: dur, size: file.size, container: (await input.getFormat()).name };
    if (v) { r.video = { w: await v.getDisplayWidth(), h: await v.getDisplayHeight(), codec: await v.getCodec(), rotation: await v.getRotation(), decodable: await v.canDecode() }; try { const st = await v.computePacketStats(120); r.video.fps = st.averagePacketRate; r.video.bitrate = st.averageBitrate; } catch (e) {} }
    if (a) r.audio = { codec: await a.getCodec(), channels: await a.getNumberOfChannels(), rate: await a.getSampleRate(), decodable: await a.canDecode() };
    return r;
  } catch (e) { return { err: 'This file format is not supported for conversion here' }; }
  finally { try { input.dispose && input.dispose(); } catch (e) {} }
}
const CONTAINERS = {
  mp4: { F: 'Mp4OutputFormat', ext: 'mp4', mime: 'video/mp4', v: ['avc', 'hevc', 'vp9', 'av1'], a: ['aac', 'opus'] },
  webm: { F: 'WebMOutputFormat', ext: 'webm', mime: 'video/webm', v: ['vp9', 'vp8', 'av1'], a: ['opus', 'vorbis'] },
  mov: { F: 'MovOutputFormat', ext: 'mov', mime: 'video/quicktime', v: ['avc', 'hevc'], a: ['aac'] },
  mkv: { F: 'MkvOutputFormat', ext: 'mkv', mime: 'video/x-matroska', v: ['avc', 'vp9', 'hevc', 'av1'], a: ['aac', 'opus'] },
  mp3: { F: 'Mp3OutputFormat', ext: 'mp3', mime: 'audio/mpeg', a: ['mp3'], audio: true },
  m4a: { F: 'Mp4OutputFormat', ext: 'm4a', mime: 'audio/mp4', a: ['aac', 'opus'], audio: true },
  ogg: { F: 'OggOutputFormat', ext: 'ogg', mime: 'audio/ogg', a: ['opus', 'vorbis'], audio: true },
  wav: { F: 'WavOutputFormat', ext: 'wav', mime: 'audio/wav', a: ['pcm-s16'], audio: true }
};
export const containerIsAudio = (c) => !!(CONTAINERS[c] && CONTAINERS[c].audio);
// opts: { container, height, fps, vbitrate (bps), quality ('high'|'medium'|'low'), targetMB, abitrate (bps), mono, mute, start, end, rotate }
export async function convertMedia(file, opts, onProgress, onCancelHandle) {
  const C = CONTAINERS[opts.container] || CONTAINERS.mp4;
  const MB = C.ext === 'mp3' ? await loadMp3() : await loadMB();
  const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(file) });
  const format = new MB[C.F](C.F === 'Mp4OutputFormat' || C.F === 'MovOutputFormat' ? { fastStart: 'in-memory' } : undefined);
  const output = new MB.Output({ format, target: new MB.BufferTarget() });
  const vt = await input.getPrimaryVideoTrack(); const at = await input.getPrimaryAudioTrack();
  const dur = await input.computeDuration(); const start = Math.max(0, +opts.start || 0); const end = +opts.end > start ? Math.min(+opts.end, dur) : dur; const len = Math.max(0.1, end - start);
  const Q = { high: MB.QUALITY_HIGH, medium: MB.QUALITY_MEDIUM, low: MB.QUALITY_LOW, vlow: MB.QUALITY_VERY_LOW };
  let abps = opts.abitrate || (C.ext === 'wav' ? 0 : 128000); if (opts.mono && abps > 96000 && C.ext !== 'mp3') abps = Math.round(abps * 0.6);
  const audio = { discard: !!opts.mute || !at };
  if (!audio.discard) {
    const ac = await MB.getFirstEncodableAudioCodec(C.a, { numberOfChannels: opts.mono ? 1 : undefined, sampleRate: undefined });
    if (!ac) throw new Error('This device cannot encode audio for ' + C.ext.toUpperCase() + '. Try another format.');
    audio.codec = ac; if (C.ext !== 'wav') audio.bitrate = abps; if (opts.mono) audio.numberOfChannels = 1; audio.forceTranscode = true;
    if (opts.rate) audio.sampleRate = opts.rate;
  }
  const video = { discard: C.audio || !vt };
  if (!video.discard) {
    const sw = await vt.getDisplayWidth(), sh = await vt.getDisplayHeight(); let w = sw, h = sh;
    const rot = ((+opts.rotate || 0) % 360 + 360) % 360; const H = +opts.height || 0;
    const short = Math.min(sw, sh); if (H && short > H) { const k = H / short; w = Math.round(sw * k / 2) * 2; h = Math.round(sh * k / 2) * 2; }
    const vc = await MB.getFirstEncodableVideoCodec(C.v, { width: w, height: h });
    if (!vc) throw new Error('This device cannot encode video for ' + C.ext.toUpperCase() + '. Try MP4 or WebM.');
    Object.assign(video, { codec: vc, forceTranscode: true, fit: 'contain' });
    if (w !== sw || h !== sh) { video.width = w; video.height = h; }
    if (rot) video.rotate = rot;
    if (opts.fps) video.frameRate = +opts.fps;
    if (opts.targetMB) { const bits = opts.targetMB * 8 * 1048576 * 0.95; let vb = bits / len - (audio.discard ? 0 : abps); if (vb < 120000) { vb = 120000; } video.bitrate = Math.round(vb); }
    else if (opts.vbitrate) video.bitrate = Math.round(opts.vbitrate);
    else video.quality = Q[opts.quality] || MB.QUALITY_MEDIUM;
  }
  const conv = await MB.Conversion.init({ input, output, video, audio, trim: start > 0 || end < dur ? { start, end } : undefined, showWarnings: false });
  if (!conv.isValid) { const why = conv.discardedTracks.map((d) => d.track.type + ': ' + d.reason.replace(/_/g, ' ')).join(', '); throw new Error('Cannot convert this file here (' + (why || 'no usable tracks') + ').'); }
  conv.onProgress = (p) => onProgress && onProgress(p);
  if (onCancelHandle) onCancelHandle(() => conv.cancel());
  await conv.execute();
  const buf = output.target.buffer;
  return { blob: new Blob([buf], { type: C.mime }), name: baseName(file.name) + (opts.suffix || '') + '.' + C.ext };
}
// Short clip to animated GIF
export async function videoToGif(file, { start = 0, end = 0, width = 480, fps = 10 } = {}, onProgress, sig) {
  const MB = await loadMB(); const G = await loadGif();
  const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(file) }); const vt = await input.getPrimaryVideoTrack(); if (!vt) throw new Error('No video track in this file');
  const dur = await input.computeDuration(); const s = Math.max(0, +start || 0); let e = +end > s ? Math.min(+end, dur) : Math.min(dur, s + 10); if (e - s > 30) e = s + 30;
  const sw = await vt.getDisplayWidth(), sh = await vt.getDisplayHeight(); const w = Math.min(width, sw); const h = Math.round(sh * w / sw);
  const sink = new MB.CanvasSink(vt, { width: w, height: h, fit: 'fill', poolSize: 2 });
  const ts = []; for (let t = s; t < e; t += 1 / fps) ts.push(t);
  const gif = G.GIFEncoder(); let i = 0; const delay = Math.round(1000 / fps); let pal = null;
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const tx = tmp.getContext('2d', { willReadFrequently: true });
  for await (const wc of sink.canvasesAtTimestamps(ts)) {
    check(sig); if (!wc) continue; tx.drawImage(wc.canvas, 0, 0, w, h); const { data } = tx.getImageData(0, 0, w, h);
    if (!pal || i % 30 === 0) pal = G.quantize(data, 256, { format: 'rgb444' });
    gif.writeFrame(G.applyPalette(data, pal, 'rgb444'), w, h, { palette: pal, delay }); i++;
    if (onProgress) onProgress(i / ts.length); if (i % 4 === 0) await tick();
  }
  gif.finish(); return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), name: baseName(file.name) + '.gif' };
}
// Encoder support summary for the UI
export async function encoderSupport() {
  const MB = await loadMB(); const r = {};
  for (const c of ['avc', 'hevc', 'vp9', 'vp8', 'av1']) r[c] = await MB.canEncodeVideo(c, { width: 1280, height: 720 }).catch(() => false);
  for (const c of ['aac', 'opus', 'mp3']) r[c] = await MB.canEncodeAudio(c).catch(() => false);
  r.webcodecs = typeof VideoEncoder !== 'undefined'; return r;
}
