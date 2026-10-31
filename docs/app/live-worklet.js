// Jonli suhbat mikrofoni: ovozni 16 kHz 16-bit PCM bo‘laklarga (har ~100 ms) aylantiradi — Gemini Live shuni kutadi.
// Brauzer qaysi chastotada yozsa ham (44,1 yoki 48 kHz), har bir chiqish namunasi o‘z davridagi kirishlarning o‘rtachasi.
class NurimMic extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / 16000; this.t = 0; this.sum = 0; this.count = 0; this.peak = 0; this.out = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = channel[i]; const a = s < 0 ? -s : s; if (a > this.peak) this.peak = a;
      this.sum += s; this.count++; this.t += 1;
      if (this.t < this.step) continue;
      this.t -= this.step; const v = Math.max(-1, Math.min(1, this.sum / this.count)); this.sum = 0; this.count = 0;
      this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === this.out.length) { this.port.postMessage({ pcm: this.out.buffer, level: this.peak }, [this.out.buffer]); this.out = new Int16Array(1600); this.n = 0; this.peak = 0; }
    }
    return true;
  }
}
registerProcessor('nurim-mic', NurimMic);
