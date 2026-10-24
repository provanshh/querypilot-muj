let ctx: AudioContext | null = null;
let muted = false;

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, delay = 0, slide?: number) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  setMuted(m: boolean) { muted = m; },
  isMuted() { return muted; },
  unlock() { ac(); },
  blip() { tone(880, 0.06, 'square', 0.03); },
  discover() { tone(523, 0.08, 'square', 0.04); tone(784, 0.12, 'square', 0.04, 0.08); },
  alert() { tone(196, 0.18, 'sawtooth', 0.05); tone(147, 0.22, 'sawtooth', 0.05, 0.14); },
  pass() { tone(1046, 0.07, 'triangle', 0.05); },
  fail() { tone(220, 0.12, 'square', 0.05, 0, 110); },
  dispatch() { [392, 523, 659].forEach((f, i) => tone(f, 0.09, 'square', 0.04, i * 0.07)); },
  stamp() { tone(90, 0.18, 'sine', 0.2, 0, 40); tone(1200, 0.03, 'square', 0.03); },
  repair() { tone(330, 0.06, 'square', 0.04); tone(440, 0.06, 'square', 0.04, 0.07); },
  victory() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.045, i * 0.09)); },
  abstain() { [440, 392, 349].forEach((f, i) => tone(f, 0.16, 'triangle', 0.05, i * 0.12)); },
  click() { tone(1320, 0.03, 'square', 0.025); },
  open() { tone(660, 0.05, 'triangle', 0.04); tone(990, 0.07, 'triangle', 0.035, 0.05); },
  plane() { tone(180, 0.5, 'sawtooth', 0.018, 0, 320); tone(240, 0.45, 'triangle', 0.015, 0.05, 420); },
  whoosh() { noise(0.7, 0.07); },
};

function noise(dur: number, vol: number) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(400, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(2400, a.currentTime + dur);
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}
