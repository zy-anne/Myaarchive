const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const color = (v, fallback) => (HEX_COLOR.test(String(v || '')) ? v : fallback);

function text(v, max) {
  return String(v ?? '').trim().slice(0, max);
}

function intInRange(v, min, max, fallback = 0) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function httpUrl(v) {
  let u;
  try { u = new URL(String(v || '').trim()); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) links are allowed');
  return u.toString();
}

function clamp(obj, limits) {
  const out = { ...obj };
  for (const [k, max] of Object.entries(limits)) if (out[k] != null) out[k] = text(out[k], max);
  return out;
}

module.exports = { HEX_COLOR, color, text, intInRange, httpUrl };
