"use client";

import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";

type GoToJailAnimationOverlayProps = {
  runId: number;
  onComplete: () => void;
};

const FALLBACK_DISMISS_MS = 8000;

export default function GoToJailAnimationOverlay({
  runId,
  onComplete,
}: GoToJailAnimationOverlayProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const hasCompletedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedSoundForRunRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/animations/go-to-jail.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load Go To Jail animation.");
        }
        return response.json();
      })
      .then((json: object) => {
        if (!cancelled) {
          setAnimationData(json);
        }
      })
      .catch(() => {
        if (!cancelled && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onComplete, runId]);

  useEffect(() => {
    hasCompletedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (hasCompletedRef.current) {
        return;
      }
      hasCompletedRef.current = true;
      onComplete();
    }, FALLBACK_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onComplete, runId]);

  useEffect(() => {
    if (hasPlayedSoundForRunRef.current === runId) {
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    const audio = new Audio("/sounds/go-to-jail.mp3");
    audio.loop = false;
    audioRef.current = audio;
    hasPlayedSoundForRunRef.current = runId;

    void audio.play().catch(() => {
      // Ignore autoplay failures so game progression is never blocked.
    });

    return () => {
      audio.pause();
      audio.currentTime = 0;
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [runId]);

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70">
      <div className="flex h-[min(84vh,30rem)] w-[min(92vw,42rem)] items-center justify-center overflow-hidden rounded-3xl border border-white/70 bg-white p-3 shadow-2xl ring-1 ring-black/10 sm:p-4">
        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          {animationData ? (
            <Lottie
              animationData={animationData}
              autoplay
              loop={false}
              className="h-full w-full object-contain"
              onComplete={() => {
                if (hasCompletedRef.current) {
                  return;
                }
                hasCompletedRef.current = true;
                onComplete();
              }}
            />
          ) : (
            <div className="h-full w-full animate-pulse rounded-2xl bg-neutral-100" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
