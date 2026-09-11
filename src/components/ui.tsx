import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClasses(variant: ButtonVariant = "primary", extra?: string): string {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-moss text-paper hover:bg-ink",
    variant === "secondary" && "border border-hairline bg-white text-ink hover:border-moss",
    variant === "ghost" && "text-taupe hover:text-ink",
    variant === "danger" && "border border-clay/40 text-clay hover:bg-clay/5",
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-2xl border border-hairline bg-white", className)}
      {...props}
    />
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.22em] text-taupe">{children}</p>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "moss" | "amber" | "clay";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-paper text-taupe border border-hairline",
        tone === "moss" && "bg-moss-soft text-moss",
        tone === "amber" && "bg-amber-soft text-amber-ink",
        tone === "clay" && "bg-clay/10 text-clay",
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
