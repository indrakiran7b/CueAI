/**
 * PCM ring buffer + 16 kHz mono WAV encoder for Groq Whisper.
 */

export class PcmRingBuffer {
  private buf: Float32Array;
  private writePos = 0;
  private filled = 0;
  readonly sampleRate: number;

  constructor(sampleRate: number, capacitySeconds = 24) {
    this.sampleRate = sampleRate;
    this.buf = new Float32Array(Math.max(1, Math.floor(sampleRate * capacitySeconds)));
  }

  get length() {
    return this.filled;
  }

  /** Absolute sample index of the newest sample + 1 (monotonic write cursor). */
  get endIndex() {
    return this.writePos;
  }

  push(chunk: Float32Array) {
    for (let i = 0; i < chunk.length; i++) {
      this.buf[this.writePos % this.buf.length] = chunk[i]!;
      this.writePos++;
      if (this.filled < this.buf.length) this.filled++;
    }
  }

  /** Read samples in [startAbs, endAbs) where abs indices are from endIndex timeline. */
  slice(startAbs: number, endAbs: number): Float32Array {
    const end = Math.min(endAbs, this.writePos);
    const earliest = this.writePos - this.filled;
    const start = Math.max(startAbs, earliest);
    if (end <= start) return new Float32Array(0);
    const out = new Float32Array(end - start);
    for (let i = 0; i < out.length; i++) {
      out[i] = this.buf[(start + i) % this.buf.length]!;
    }
    return out;
  }

  clear() {
    this.writePos = 0;
    this.filled = 0;
    this.buf.fill(0);
  }
}

/** Mix multi-channel AudioBuffer channel data to mono Float32. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0]!;
  const len = channels[0]!.length;
  const out = new Float32Array(len);
  const n = channels.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) sum += channels[c]![i] || 0;
    out[i] = sum / n;
  }
  return out;
}

export function rmsLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** Light peak normalize so quiet speech still reaches Whisper. */
export function normalizeGain(samples: Float32Array, targetPeak = 0.85): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
  }
  if (peak < 0.001 || peak > targetPeak) {
    if (peak < 0.001) return samples;
  }
  if (peak <= targetPeak && peak >= 0.08) return samples;
  const gain = peak > 0 ? Math.min(8, targetPeak / peak) : 1;
  if (Math.abs(gain - 1) < 0.05) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-1, Math.min(1, samples[i]! * gain));
  }
  return out;
}

export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  if (!input.length) return new Float32Array(0);
  const ratio = inputRate / 16000;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0]! * (1 - t) + input[i1]! * t;
  }
  return out;
}

/** Encode mono float PCM as 16-bit little-endian WAV. */
export function encodeWavPcm16(samples: Float32Array, sampleRate = 16000): Blob {
  const dataLen = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function prepareGroqWav(raw: Float32Array, inputRate: number): Blob {
  const mono = normalizeGain(raw);
  const resampled = resampleTo16k(mono, inputRate);
  return encodeWavPcm16(resampled, 16000);
}
