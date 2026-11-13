/**
 * Exports every Zod data contract as JSON Schema (draft 2020-12) to docs/contracts/, so that the
 * Python pipeline validates its exports against exactly the same rules as the web app.
 *
 * Usage (from web/): npm run contracts:export
 * Run it after any approved contract change, and commit the regenerated schemas.
 * Cross-field rules (for example "weights sum to 1") cannot be expressed in JSON Schema. They are
 * enforced in TypeScript and re-checked by the Python tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CONTRACT_VERSION, SCHEMA_EXPORTS } from "../src/lib/contracts";

const outDir = fileURLToPath(new URL("../../docs/contracts/", import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(SCHEMA_EXPORTS)) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" });
  const document = {
    title: `${name} (contract ${CONTRACT_VERSION})`,
    $comment: "Generated from web/src/lib/contracts by `npm run contracts:export`. Do not edit by hand.",
    ...jsonSchema,
  };
  writeFileSync(join(outDir, `${name}.schema.json`), `${JSON.stringify(document, null, 2)}\n`);
  console.log(`wrote docs/contracts/${name}.schema.json`);
}
