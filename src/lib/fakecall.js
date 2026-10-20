let ctx = null;
let ringTimer = null;

export function primeAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function burst(at, len) {
  for (const f of [440, 480]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.08, at + 0.02);
    g.gain.setValueAtTime(0.08, at + len - 0.05);
    g.gain.linearRampToValueAtTime(0, at + len);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + len);
  }
}

export function startRinging() {
  stopRinging();
  const ring = () => {
    navigator.vibrate?.([800, 400, 800]);
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    burst(t, 0.4);
    burst(t + 0.6, 0.4);
  };
  ring();
  ringTimer = setInterval(ring, 3000);
}

export function stopRinging() {
  clearInterval(ringTimer);
  ringTimer = null;
  navigator.vibrate?.(0);
}

const SCRIPT = [
  'Hello? Where are you right now?',
  'Listen, I need you to come home. It is urgent.',
  'No, I cannot explain on the phone. Please just leave now.',
  'Okay. Call me as soon as you are on your way. I am waiting.',
];

export function speakScript() {
  const synth = window.speechSynthesis;
  if (!synth) return () => {};
  synth.cancel();
  const voices = synth.getVoices();
  const voice =
    voices.find((v) => /en-IN/i.test(v.lang) && /female|woman|heera|veena/i.test(v.name)) ||
    voices.find((v) => /en-IN/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang));
  let stopped = false;
  let i = 0;
  const next = () => {
    if (stopped || i >= SCRIPT.length) return;
    const u = new SpeechSynthesisUtterance(SCRIPT[i++]);
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = () => setTimeout(next, 2500);
    synth.speak(u);
  };
  setTimeout(next, 900);
  return () => {
    stopped = true;
    synth.cancel();
  };
}
