/**
 * Gapless PCM playback for streaming audio (e.g. Gemini Live).
 * Uses a single AudioContext and schedules chunks with nextPlaybackTime to avoid gaps and crackling.
 */

const DEFAULT_SAMPLE_RATE = 24000;

/** Decode base64 to PCM bytes (handles URL-safe base64). */
function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Convert 16-bit signed little-endian PCM to Float32Array (-1 to 1). */
function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const len = bytes.length - (bytes.length % 2);
  const numSamples = len / 2;
  const out = new Float32Array(numSamples);
  const view = new DataView(bytes.buffer, bytes.byteOffset, len);
  for (let i = 0; i < numSamples; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/** Parse sample rate from mimeType e.g. "audio/pcm;rate=24000" */
export function parseRateFromMimeType(mimeType?: string): number {
  if (!mimeType) return DEFAULT_SAMPLE_RATE;
  const m = mimeType.match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : DEFAULT_SAMPLE_RATE;
}

export interface PCMPlayerCallbacks {
  onPlayingChange?: (playing: boolean) => void;
}

export class PCMPlayer {
  private sampleRate: number;
  private ctx: AudioContext | null = null;
  private nextPlaybackTime: number = 0;
  private callbacks: PCMPlayerCallbacks;
  private scheduledCount: number = 0;

  constructor(sampleRate: number = DEFAULT_SAMPLE_RATE, callbacks: PCMPlayerCallbacks = {}) {
    this.sampleRate = sampleRate;
    this.callbacks = callbacks;
  }

  setSampleRate(rate: number): void {
    this.sampleRate = rate;
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate });
    }
    return this.ctx;
  }

  private setPlaying(playing: boolean): void {
    this.callbacks.onPlayingChange?.(playing);
  }

  /**
   * Push a base64-encoded PCM chunk (16-bit signed LE mono). Schedules gapless playback.
   */
  async pushBase64(base64: string): Promise<void> {
    const bytes = base64ToBytes(base64);
    const samples = pcm16ToFloat32(bytes);
    if (samples.length === 0) return;
    await this.pushSamples(samples);
  }

  /**
   * Push Float32 samples (-1 to 1). Schedules on shared timeline for gapless playback.
   */
  async pushSamples(samples: Float32Array): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const now = ctx.currentTime;
    if (this.nextPlaybackTime < now) {
      this.nextPlaybackTime = now;
    }
    const buffer = ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(this.nextPlaybackTime);
    this.nextPlaybackTime += buffer.duration;
    this.scheduledCount++;
    this.setPlaying(true);
    source.onended = () => {
      this.scheduledCount--;
      if (this.scheduledCount <= 0) {
        this.scheduledCount = 0;
        this.setPlaying(false);
      }
    };
  }

  /** Stop all scheduled playback and reset timeline. */
  stop(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.nextPlaybackTime = 0;
    this.scheduledCount = 0;
    this.setPlaying(false);
  }

  /** Pause/reset timeline but keep context for next stream. */
  flush(): void {
    this.nextPlaybackTime = 0;
    this.scheduledCount = 0;
    this.setPlaying(false);
  }

  get isPlaying(): boolean {
    return this.scheduledCount > 0;
  }
}
