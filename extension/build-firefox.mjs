// Build the Firefox/Gecko variant (Firefox, Zen, LibreWolf … 128+) from the same
// src/background.ts into dist-firefox/. Differences from the Chromium build:
//  1. Gecko MV3 has no background.service_worker — use background.scripts (event page).
//  2. Gecko needs browser_specific_settings.gecko.id.
//  3. executeScript runs in world: "MAIN" so the fetch carries the page's own
//     origin/cookies (Gecko's isolated-world fetch differs from Chromium's).
// Usage: OE_MCP_RELAY_PORT=8787 node build-firefox.mjs
import { build } from "esbuild";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "dist-firefox");
const port = parseInt(process.env.OE_MCP_RELAY_PORT ?? "8787", 10);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "icons"), { recursive: true });

const mainWorldPlugin = {
  name: "firefox-main-world",
  setup(b) {
    b.onLoad({ filter: /background\.ts$/ }, (args) => {
      const src = readFileSync(args.path, "utf8");
      const needle = "target: { tabId },";
      if (!src.includes(needle)) throw new Error(`firefox build: "${needle}" not found in background.ts — update this patch`);
      return { contents: src.replace(needle, `${needle}\n    world: "MAIN",`), loader: "ts" };
    });
  },
};

await build({
  entryPoints: [join(here, "src", "background.ts")],
  outfile: join(outDir, "background.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "firefox128",
  define: { __RELAY_PORT__: String(port) },
  legalComments: "none",
  plugins: [mainWorldPlugin],
});

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
manifest.background = { scripts: ["background.js"] };
manifest.browser_specific_settings = {
  gecko: {
    id: "openevidence-mcp-relay@local",
    strict_min_version: "128.0",
    data_collection_permissions: { required: ["none"] },
  },
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, "\t") + "\n");

for (const size of [16, 32, 48, 128]) {
  copyFileSync(join(here, "icons", `icon${size}.png`), join(outDir, "icons", `icon${size}.png`));
}
for (const name of ["README.html", "readme.js"]) {
  const src = readFileSync(join(here, name), "utf8").replaceAll("__RELAY_PORT__", String(port));
  writeFileSync(join(outDir, name), src);
}

console.log(`built Firefox extension -> extension/dist-firefox (relay port ${port})`);
