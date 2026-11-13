import type { NextConfig } from "next";

/**
 * Fresh Control Tower: Next.js configuration.
 *
 * The site is a pure static export (implementation-plan.md §2.3). The host only serves files:
 * heavy computation is precomputed offline in Python, and interactive work runs in the browser.
 *
 * Cache Components and partial prefetching (enabled by the create-next-app template) are
 * deliberately left off. They are server-rendering features that need the Node.js runtime,
 * which a static export does not have (decision D-10 in PROGRESS.md).
 */
const nextConfig: NextConfig = {
  output: "export",
  // Emit /route/index.html so every static host (Vercel, Cloudflare, GitHub Pages) resolves routes.
  trailingSlash: true,
  // The default image optimiser needs a server; static exports must use unoptimised images.
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
