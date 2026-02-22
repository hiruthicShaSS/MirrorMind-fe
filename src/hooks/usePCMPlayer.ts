import { useState, useCallback, useRef, useEffect } from 'react';
import { PCMPlayer, parseRateFromMimeType } from '../lib/pcmPlayer';

export interface UsePCMPlayerResult {
  push: (base64: string, mimeType?: string) => void;
  stop: () => void;
  isPlaying: boolean;
}

const DEFAULT_SAMPLE_RATE = 24000;

/**
 * React hook for gapless streaming PCM playback (e.g. Gemini Live audio).
 * Uses Web Audio API with a shared timeline (nextPlaybackTime) to avoid crackling.
 */
export function usePCMPlayer(): UsePCMPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<PCMPlayer | null>(null);

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = new PCMPlayer(DEFAULT_SAMPLE_RATE, {
        onPlayingChange: setIsPlaying,
      });
    }
    return playerRef.current;
  }, []);

  const push = useCallback((base64: string, mimeType?: string) => {
    const player = getPlayer();
    const rate = parseRateFromMimeType(mimeType);
    player.setSampleRate(rate);
    player.pushBase64(base64);
  }, [getPlayer]);

  const stop = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current = null;
      }
    };
  }, []);

  return { push, stop, isPlaying };
}
