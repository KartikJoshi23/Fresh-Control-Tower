/**
 * A labelled stand-in for a page that a later part builds (Parts 6–9), so every top-bar link resolves
 * (no 404s, no console errors) while the shell is in place. Each page owner replaces their page.tsx.
 */
import { GlassPanel } from "@/components/ui/GlassPanel";

interface PagePlaceholderProps {
  title: string;
  purpose: string;
  part: string;
}

export function PagePlaceholder({ title, purpose, part }: PagePlaceholderProps) {
  return (
    <div className="page-grid py-8">
      <header className="col-span-12 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-ink-secondary max-w-3xl">{purpose}</p>
      </header>
      <GlassPanel variant="deco" className="col-span-12 p-6" data-testid="page-placeholder">
        <p className="text-ink-secondary">This page is built in {part} (implementation-plan.md §10.1).</p>
      </GlassPanel>
    </div>
  );
}
