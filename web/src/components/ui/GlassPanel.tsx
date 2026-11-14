/**
 * GlassPanel (docs/design-system.md §3, §6).
 * - variant "chart": navy glass, validated behind data. Every panel that holds data uses it.
 * - variant "deco": light decorative glass, never behind data.
 * One blur layer per panel; a solid surface when backdrop-filter is unsupported (see globals.css).
 */
import type { ElementType, ReactNode } from "react";

interface GlassPanelProps {
  variant?: "chart" | "deco";
  as?: ElementType;
  className?: string;
  children: ReactNode;
  /** Forwarded for landmarks and tests, for example aria-labelledby. */
  [attr: `aria-${string}` | `data-${string}`]: string | undefined;
}

export function GlassPanel({ variant = "chart", as: Tag = "section", className = "", children, ...rest }: GlassPanelProps) {
  return (
    <Tag className={`glass-panel glass-${variant} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
