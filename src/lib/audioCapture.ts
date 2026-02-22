const TARGET_SAMPLE_RATE = 16000;

/**
 * Capture mic and encode to 16-bit PCM 16 kHz as base64.
 * onChunk is called with each base64 chunk; call the returned stop() to end and get full base64.
 */
export async function startMicCapture(
  onChunk?: (base64Chunk: string) => void
): Promise<{ stop: () => Promise<string> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext({ sampleRate: 48000 });
  const source = ctx.createMediaStreamSource(stream);
  const bufferSize = 4096;
  const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);
  const chunks: Uint8Array[] = [];
  let targetSampleIndex = 0;
  const ratio = ctx.sampleRate / TARGET_SAMPLE_RATE;

  scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0);
    const output: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const targetIndex = i / ratio;
      if (Math.floor(targetIndex) >= targetSampleIndex) {
        output.push(input[i]);
        targetSampleIndex++;
      }
    }
    if (output.length === 0) return;
    const pcm16 = new Int16Array(output.length);
    for (let j = 0; j < output.length; j++) {
      const s = Math.max(-1, Math.min(1, output[j]));
      pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    chunks.push(new Uint8Array(pcm16.buffer));
    onChunk?.(btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer))));
  };

  source.connect(scriptNode);
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
        const binary = new TextDecoder('latin1').decode(combined);
        resolve(btoa(binary));
      }),
  };
}
