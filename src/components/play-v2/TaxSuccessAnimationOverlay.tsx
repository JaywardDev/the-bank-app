"use client";

import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";

type TaxSuccessAnimationOverlayProps = {
  runId: number;
  onComplete: () => void;
};

const FALLBACK_DISMISS_MS = 7000;

export default function TaxSuccessAnimationOverlay({
  runId,
  onComplete,
}: TaxSuccessAnimationOverlayProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void fetch("/animations/payment-successful.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load tax success animation.");
        }
        return response.json();
      })
      .then((json: object) => {
        if (!cancelled) {
          setAnimationData(json);
        }
      })
      .catch(() => {
        if (!cancelled) {
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

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60">
      <div className="flex h-[min(78vh,26rem)] w-[min(88vw,22rem)] items-center justify-center rounded-3xl border border-emerald-200 bg-white/95 p-3 shadow-2xl ring-1 ring-black/10 backdrop-blur sm:p-4">
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
            <div className="h-full w-full animate-pulse rounded-2xl bg-emerald-50" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
