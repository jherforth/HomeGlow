// Dev-only generator for the bundled default chore notification sounds.
//
// Produces short, self-authored WAV tones (no third-party audio / no licensing
// concerns) under server/assets/sounds/. The committed .wav output is what the
// server seeds into uploads/sounds/ at startup, so runtime never depends on this
// script. Re-run it only when you want to regenerate/tweak the default bank:
//
//   node server/scripts/generateDefaultSounds.js
//
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

// Render a list of tone segments into a mono Float32 buffer (values in [-1, 1]).
// Each segment: { freq, start, duration, gain, type }.
function renderSegments(segments, totalDuration) {
  const length = Math.ceil(totalDuration * SAMPLE_RATE);
  const data = new Float32Array(length);

  for (const seg of segments) {
    const startSample = Math.floor(seg.start * SAMPLE_RATE);
    const segSamples = Math.floor(seg.duration * SAMPLE_RATE);
    const gain = seg.gain === undefined ? 0.6 : seg.gain;
    const type = seg.type || 'sine';

    for (let i = 0; i < segSamples; i++) {
      const idx = startSample + i;
      if (idx >= length) break;

      const t = i / SAMPLE_RATE;
      const phase = 2 * Math.PI * seg.freq * t;

      let sample;
      switch (type) {
        case 'square':
          sample = Math.sign(Math.sin(phase));
          break;
        case 'triangle':
          sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
          break;
        default:
          sample = Math.sin(phase);
      }

      // Percussive envelope: quick attack, exponential decay -> a pleasant "ping".
      const progress = i / segSamples;
      const attack = Math.min(1, progress / 0.02);
      const decay = Math.exp(-3.5 * progress);
      const envelope = attack * decay;

      data[idx] += sample * gain * envelope;
    }
  }

  // Guard against clipping from overlapping segments.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 1) {
    for (let i = 0; i < length; i++) data[i] /= peak;
  }

  return data;
}

// Encode a mono Float32 buffer as a 16-bit PCM WAV file.
function encodeWav(float32) {
  const numSamples = float32.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);        // fmt chunk size
  buffer.writeUInt16LE(1, 20);         // PCM
  buffer.writeUInt16LE(1, 22);         // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34);        // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    buffer.writeInt16LE(Math.round(s * 32767), offset);
    offset += 2;
  }

  return buffer;
}

// The default bank. Frequencies chosen to be recognizable and distinct.
const SOUNDS = {
  chime: {
    total: 0.9,
    segments: [
      { freq: 880.0, start: 0.0, duration: 0.5, gain: 0.6 },   // A5
      { freq: 1174.7, start: 0.18, duration: 0.7, gain: 0.5 }, // D6
    ],
  },
  'ding-dong': {
    total: 1.1,
    segments: [
      { freq: 987.8, start: 0.0, duration: 0.5, gain: 0.6 },   // B5 (ding)
      { freq: 783.99, start: 0.45, duration: 0.65, gain: 0.6 }, // G5 (dong)
    ],
  },
  bell: {
    total: 1.4,
    segments: [
      { freq: 660.0, start: 0.0, duration: 1.4, gain: 0.5 },
      { freq: 1320.0, start: 0.0, duration: 1.0, gain: 0.25 }, // octave harmonic for "bell" shimmer
      { freq: 1980.0, start: 0.0, duration: 0.6, gain: 0.12 },
    ],
  },
  marimba: {
    total: 1.0,
    segments: [
      { freq: 523.25, start: 0.0, duration: 0.35, gain: 0.6, type: 'triangle' },  // C5
      { freq: 659.25, start: 0.18, duration: 0.35, gain: 0.6, type: 'triangle' }, // E5
      { freq: 783.99, start: 0.36, duration: 0.55, gain: 0.6, type: 'triangle' }, // G5
    ],
  },
  alarm: {
    total: 1.2,
    segments: [
      { freq: 1046.5, start: 0.0, duration: 0.18, gain: 0.55, type: 'square' },
      { freq: 1046.5, start: 0.3, duration: 0.18, gain: 0.55, type: 'square' },
      { freq: 1046.5, start: 0.6, duration: 0.18, gain: 0.55, type: 'square' },
      { freq: 1046.5, start: 0.9, duration: 0.18, gain: 0.55, type: 'square' },
    ],
  },
  blip: {
    total: 0.35,
    segments: [
      { freq: 1318.5, start: 0.0, duration: 0.12, gain: 0.55, type: 'square' },
      { freq: 1760.0, start: 0.1, duration: 0.2, gain: 0.5, type: 'square' },
    ],
  },
};

function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'sounds');
  fs.mkdirSync(outDir, { recursive: true });

  for (const [name, def] of Object.entries(SOUNDS)) {
    const samples = renderSegments(def.segments, def.total);
    const wav = encodeWav(samples);
    const filePath = path.join(outDir, `${name}.wav`);
    fs.writeFileSync(filePath, wav);
    console.log(`Wrote ${filePath} (${wav.length} bytes)`);
  }

  console.log('Default chore sounds generated.');
}

main();
