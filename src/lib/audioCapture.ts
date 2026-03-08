const TARGET_SAMPLE_RATE = 16000;

/**
 * Capture mic and encode to 16-bit little-endian PCM at 16 kHz as base64.
 * Uses AudioContext at 16 kHz so the browser handles resampling natively.
 * Call the returned stop() to end recording and get the full base64 payload.
 */
export async function startMicCapture(
  onChunk?: (base64Chunk: string) => void
): Promise<{ stop: () => Promise<string> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  const source = ctx.createMediaStreamSource(stream);
  const bufferSize = 4096;
  const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);
  const chunks: Uint8Array[] = [];

  scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0); // Float32 [-1, 1]
    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(pcm16.buffer);
    chunks.push(bytes);

    if (onChunk) {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      onChunk(btoa(binary));
    }
  };

  source.connect(scriptNode);
  // Connect through a zero-gain node so audio doesn't play through speakers
  const gain = ctx.createGain();
  gain.gain.value = 0;
  scriptNode.connect(gain);
  gain.connect(ctx.destination);

  return {
    stop: () =>
      new Promise<string>((resolve) => {
        scriptNode.disconnect();
        source.disconnect();
        ctx.close();
        stream.getTracks().forEach((t) => t.stop());

        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          combined.set(c, offset);
          offset += c.length;
        }

        let binary = '';
        for (let i = 0; i < combined.length; i++) {
          binary += String.fromCharCode(combined[i]);
        }
        resolve(btoa(binary));
      }),
  };
}
