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
      <div className="w-[min(88vw,28rem)] max-w-full">
        {animationData ? (
          <Lottie
            animationData={animationData}
            autoplay
            loop={false}
            onComplete={() => {
              if (hasCompletedRef.current) {
                return;
              }
              hasCompletedRef.current = true;
              onComplete();
            }}
          />
        ) : (
          <div className="h-40 w-40 animate-pulse rounded-full bg-white/10" aria-hidden />
        )}
      </div>
    </div>
  );
}
