/**
 * Phase 4 placeholder home page.
 *
 * It proves that the static export, the font and the design tokens work. It loads no data.
 * Phase 5 replaces it: Part 5 builds the app shell and Part 6 builds the Overview page.
 */
const UPCOMING = [
  { part: "Parts 1–4", track: "Python pipeline", detail: "clean, calibrate, generate the UAE world, models, optimisation, exports" },
  { part: "Part 5", track: "Web", detail: "app shell, top navigation, Scenario Console, data loaders" },
  { part: "Parts 6–9", track: "Web", detail: "Overview, Demand Lab, Scenario Studio, Live Ops, Sourcing, Impact, Roadmap" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-sm uppercase tracking-widest text-ink-muted">Group 1 · AI for Inventory Management</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Fresh Control Tower</h1>
        <p className="text-lg text-ink-secondary">
          AI replenishment for UAE fresh grocery: recover the demand that empty shelves hide, plan for festivals
          and sudden spikes, and source under disruption.
        </p>
      </header>

      <section
        aria-labelledby="status-heading"
        className="rounded-2xl border p-6 backdrop-blur-xl"
        style={{ background: "var(--glass-chart)", borderColor: "var(--hairline)" }}
      >
        <h2 id="status-heading" className="text-lg font-medium">
          Repository set up: the dashboard is built in Phase 5
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {UPCOMING.map((item) => (
            <li key={item.part} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <span className="min-w-24 font-medium text-ink">{item.part}</span>
              <span className="text-ink-secondary">
                {item.track}: {item.detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-ink-muted">
        Prototype for an academic boardroom simulation. The operator is fictional, and synthetic data is labelled
        wherever it appears.
      </p>
    </main>
  );
}
