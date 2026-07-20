/**
 * Dumps the in-app demo dataset to `supabase/seed.local.json` for inspection or
 * for importing into tests / a custom Supabase importer.
 *
 * The running app seeds this same data into the browser automatically on first
 * load (local backend), so this script is a convenience, not a requirement.
 *
 *   npm run seed
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeed } from "../src/lib/data/seed";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../supabase/seed.local.json");

const data = buildSeed();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");

console.log(`✓ Wrote demo dataset to ${outPath}`);
console.log(
  `  ${data.boards.length} boards · ${data.rooms.length} rooms · ${data.submissions.length} submissions · ${data.profiles.length} profiles`,
);
