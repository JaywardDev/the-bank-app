"use client";

type InfoTooltipProps = {
  text: string;
  className?: string;
};

export default function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <details className={`group relative inline-block ${className ?? ""}`.trim()}>
      <summary
        className="list-none cursor-help select-none text-xs text-neutral-500 marker:hidden"
        aria-label={text}
        title={text}
      >
        ℹ️
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-2 text-xs font-medium normal-case text-neutral-700 shadow-lg group-open:block">
        {text}
      </div>
    </details>
  );
}
