import Image from "next/image";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

type PlayV2ActionButtonProps = {
  iconSrc: string;
  iconAlt?: string;
  ariaLabel: string;
  title?: string;
  isActive?: boolean;
  badge?: ReactNode;
  indicator?: ReactNode;
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title">;

const baseButtonClass =
  "inline-flex h-12 w-12 items-center justify-center rounded-full border p-0 text-neutral-900 shadow-lg shadow-black/35 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-45";

const defaultButtonStateClass =
  "border-stone-400 bg-stone-300/95 text-neutral-900 hover:border-stone-500 hover:bg-stone-400 active:scale-[0.98] active:border-stone-500 active:bg-stone-400";

const activeButtonStateClass =
  "border-amber-400 bg-amber-200 text-neutral-900 shadow-lg shadow-black/35 hover:bg-amber-100 active:scale-[0.98]";

const defaultIconClass = "h-7 w-7 object-contain";

export function PlayV2ActionButton({
  iconSrc,
  iconAlt = "",
  ariaLabel,
  title,
  isActive = false,
  badge,
  indicator,
  className = "",
  buttonClassName = "",
  iconClassName = "",
  children,
  type = "button",
  ...buttonProps
}: PlayV2ActionButtonProps) {
  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type={type}
        className={`${baseButtonClass} ${isActive ? activeButtonStateClass : defaultButtonStateClass} ${buttonClassName}`.trim()}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        {...buttonProps}
      >
        <Image src={iconSrc} alt={iconAlt} width={28} height={28} className={`${defaultIconClass} ${iconClassName}`.trim()} aria-hidden />
        {children}
      </button>
      {badge}
      {indicator}
    </div>
  );
}
