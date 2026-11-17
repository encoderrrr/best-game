// All sound is synthesized with WebAudio: no audio files ship with the game. The context
// is created lazily on the first user gesture (browsers block audio before one), and every
// sound is a few oscillators or a short burst of filtered noise. M mutes everything.

const MUSIC_NOTES = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
const MUSIC_STEP = 0.42;

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone({ type, from, to, seconds, volume, when = 0, slideTo = null }) {
    if (!context || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), start + seconds);
    else if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise({ seconds, volume, cutoff, when = 0 }) {
    if (!context || muted) return;
    const start = context.currentTime + when;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  function musicTick() {
    if (!context || muted) return;
    const note = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
    musicStep += 1;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = note;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + MUSIC_STEP);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start();
    osc.stop(context.currentTime + MUSIC_STEP + 0.05);
  }

  return {
    /** Call from a user gesture so the browser lets audio start. */
    unlock() {
      if (!ensure()) return;
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (musicTimer === null) {
        musicTimer = window.setInterval(musicTick, MUSIC_STEP * 1000);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone({ type: 'square', from: 880, to: 320, seconds: 0.09, volume: 0.12 });
    },
    explode() {
      noise({ seconds: 0.28, volume: 0.5, cutoff: 900 });
      tone({ type: 'sine', from: 160, to: 40, seconds: 0.3, volume: 0.4 });
    },
    hit() {
      tone({ type: 'sawtooth', from: 220, to: 55, seconds: 0.35, volume: 0.35 });
      noise({ seconds: 0.18, volume: 0.3, cutoff: 500 });
    },
    pickup() {
      tone({ type: 'sine', from: 660, to: 660, seconds: 0.09, volume: 0.25 });
      tone({ type: 'sine', from: 990, to: 990, seconds: 0.12, volume: 0.25, when: 0.07 });
    },
    core() {
      tone({ type: 'triangle', from: 1320, to: 1320, seconds: 0.07, volume: 0.14 });
    },
    wave() {
      tone({ type: 'triangle', from: 392, to: 392, seconds: 0.12, volume: 0.22 });
      tone({ type: 'triangle', from: 523, to: 523, seconds: 0.12, volume: 0.22, when: 0.1 });
      tone({ type: 'triangle', from: 784, to: 784, seconds: 0.2, volume: 0.22, when: 0.2 });
    },
    over() {
      tone({ type: 'triangle', from: 392, to: 392, seconds: 0.25, volume: 0.25 });
      tone({ type: 'triangle', from: 311, to: 311, seconds: 0.25, volume: 0.25, when: 0.22 });
      tone({ type: 'triangle', from: 233, to: 233, seconds: 0.5, volume: 0.25, when: 0.44 });
    },
  };
}
