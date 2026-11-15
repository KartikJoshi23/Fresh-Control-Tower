/**
 * GlassPanel (docs/design-system.md §3, §6).
 * - variant "chart": violet-black glass (CR-003), validated behind data. Every panel that holds data uses it.
 * - variant "deco": light decorative glass, never behind data.
 * One blur layer per panel; a solid surface when backdrop-filter is unsupported (see globals.css).
 */
import type { ElementType, ReactNode, Ref } from "react";

interface GlassPanelProps {
  variant?: "chart" | "deco";
  as?: ElementType;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
  /** Forwarded for landmarks and tests, for example aria-labelledby. */
  [attr: `aria-${string}` | `data-${string}`]: string | undefined;
}

export function GlassPanel({ variant = "chart", as: Tag = "section", className = "", children, ref, ...rest }: GlassPanelProps) {
  return (
    <Tag ref={ref} className={`glass-panel glass-${variant} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
