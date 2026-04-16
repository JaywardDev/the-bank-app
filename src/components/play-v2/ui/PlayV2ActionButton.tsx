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
  "inline-flex h-12 w-12 items-center justify-center rounded-full border p-0 text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-40";

const defaultButtonStateClass =
  "border-white/30 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98] active:bg-neutral-700";

const activeButtonStateClass = "border-sky-300/70 bg-sky-500/20 text-white";

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
