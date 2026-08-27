import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "success" | "warning" | "danger" | "quiet" | "dark";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
};

const tones = {
  primary: "bg-pool text-white hover:bg-[#136b7a]",
  success: "bg-mint text-white hover:bg-[#27835d]",
  warning: "bg-amber text-ink hover:bg-[#df941d]",
  danger: "bg-fire text-white hover:bg-[#bc2424]",
  quiet: "bg-white text-ink ring-1 ring-black/10 hover:bg-black/5 dark:bg-white/10 dark:text-white dark:ring-white/15",
  dark: "bg-ink text-white hover:bg-black"
};

const sizes = {
  sm: "h-10 px-3 text-sm",
  md: "h-12 px-4 text-base",
  lg: "h-14 px-5 text-lg"
};

export function Button({ tone = "primary", size = "md", icon, children, className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        tones[tone],
        sizes[size],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
