/**
 * Validates every JSON artefact in web/public/data against its data contract.
 * Exits with code 1 if any file fails or has no contract.
 *
 * Usage (from web/): npm run data:validate
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { contractFor } from "../src/lib/contracts";

const dataDir = fileURLToPath(new URL("../public/data/", import.meta.url));

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listJsonFiles(full);
    return name.endsWith(".json") ? [full] : [];
  });
}

let failures = 0;
let fixtures = 0;
const files = listJsonFiles(dataDir);

for (const file of files) {
  const rel = relative(dataDir, file).replace(/\\/g, "/");
  const schema = contractFor(rel);
  if (!schema) {
    failures += 1;
    console.error(`✗ ${rel}: no data contract matches this path`);
    continue;
  }
  const result = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!result.success) {
    failures += 1;
    console.error(`✗ ${rel}`);
    for (const issue of result.error.issues.slice(0, 10)) {
      console.error(`    ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    continue;
  }
  const isFixture = (result.data as { isFixture: boolean }).isFixture;
  if (isFixture) fixtures += 1;
  console.log(`✓ ${rel}${isFixture ? "  (fixture: placeholder data)" : ""}`);
}

console.log(`\n${files.length - failures}/${files.length} files valid; ${fixtures} fixture file(s).`);
if (failures > 0) process.exit(1);
