/**
 * Backdrop (CR-003): the black plane behind every page. Three faint, slow-drifting glows in different hues
 * (violet, cyan, pink), the page's own accent glow at the top (--page-accent), a dot grid that fades out
 * down the page, and a faint grain. Pure CSS (globals.css, "Backdrop"),
 * transform-only animation, frozen under prefers-reduced-motion. Decorative, so it is hidden from
 * assistive technology and never sits directly behind data (panels carry their own glass).
 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="aurora aurora-1" />
      <div className="aurora aurora-2" />
      <div className="aurora aurora-3" />
      <div className="backdrop-accent" />
      <div className="backdrop-grid" />
      <div className="backdrop-grain" />
    </div>
  );
}
