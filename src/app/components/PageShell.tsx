import Link from "next/link";
import type { ReactNode } from "react";

const shellStyles = {
  player: {
    main: "min-h-dvh bg-neutral-50 p-6 flex items-start justify-center",
    container: "w-full max-w-md space-y-6",
    title: "text-2xl font-semibold text-neutral-900",
    subtitle: "text-sm text-neutral-600",
    link: "text-xs text-neutral-500 hover:text-neutral-800",
  },
  board: {
    main: "min-h-dvh bg-neutral-950 text-neutral-100 p-6 md:p-10",
    container: "mx-auto w-full max-w-6xl space-y-8",
    title: "text-4xl md:text-5xl font-semibold",
    subtitle: "text-base text-neutral-300",
    link: "text-xs text-neutral-400 hover:text-white",
  },
};

type PageShellProps = {
  title: string;
  subtitle?: string;
  variant?: "player" | "board";
  children: ReactNode;
};

export default function PageShell({
  title,
  subtitle,
  variant = "player",
  children,
}: PageShellProps) {
  const styles = shellStyles[variant];

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className="space-y-2">
          <Link className={styles.link} href="/">
            ← Back to home
          </Link>
          <div className="space-y-1">
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
