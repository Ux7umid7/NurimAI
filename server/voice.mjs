// Voice answers in Telegram: Gemini's TTS gives a WAV, but Telegram shows a voice note only for OGG/Opus, MP3 or M4A,
// so the speech becomes a 16 kHz, 32 kbps mono MP3 here (about 1 s of CPU per minute of speech; at 24 kHz LAME is 10x slower).
import { Mp3Encoder } from '@breezystack/lamejs';
import mathModule from '../src/shared/math-text.js';
const { plainMath } = mathModule;

export const RATE = 16000;
const ascii = (bytes, at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
// 16-bit PCM WAV -> { rate, samples } (first channel); anything else throws.
export function wavSamples(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') throw new Error('not a WAV');
  let at = 12, rate = 0, channels = 1, bits = 0;
  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at, 4), size = view.getUint32(at + 4, true), body = at + 8;
    if (id === 'fmt ') { channels = view.getUint16(body + 2, true); rate = view.getUint32(body + 4, true); bits = view.getUint16(body + 14, true); }
    if (id === 'data') {
      if (bits !== 16 || !rate) throw new Error('not 16-bit PCM');
      const frames = Math.floor(Math.min(size, bytes.length - body) / (2 * channels)), samples = new Int16Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = view.getInt16(body + i * 2 * channels, true);
      return { rate, samples };
    }
    at = body + size + (size % 2);
  }
  throw new Error('no audio data');
}
// Linear resampling, enough for speech.
export function resample(samples, from, to) {
  if (from === to) return samples;
  const out = new Int16Array(Math.floor(samples.length * to / from)), step = from / to;
  for (let i = 0; i < out.length; i++) { const x = i * step, j = Math.floor(x), f = x - j; out[i] = Math.round(samples[j] * (1 - f) + (samples[Math.min(j + 1, samples.length - 1)] * f)); }
  return out;
}
export function mp3(samples, rate = RATE) {
  const encoder = new Mp3Encoder(1, rate, 32), parts = [];
  for (let i = 0; i < samples.length; i += 1152) { const chunk = encoder.encodeBuffer(samples.subarray(i, i + 1152)); if (chunk.length) parts.push(chunk); }
  const end = encoder.flush(); if (end.length) parts.push(end);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
export function wavToMp3(base64) {
  const bin = atob(base64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { rate, samples } = wavSamples(bytes);
  return mp3(resample(samples, rate, RATE));
}
// What is read aloud: the answer without Markdown, code or emoji, cut at a sentence end to fit the TTS limit.
export function speechText(answer, max = 1100) {
  const text = plainMath(String(answer || '')).replace(/```[\s\S]*?```/g, ' (kod matnda) ').replace(/`([^`]*)`/g, '$1').replace(/\*\*|__|^#{1,6}\s+/gm, '')
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, '').replace(/^\s*[-*•]\s+/gm, '').replace(/https?:\/\/\S+/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
  if (text.length <= max) return text;
  const cut = text.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}
