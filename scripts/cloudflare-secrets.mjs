import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const local = parseEnv(readFileSync(".env", "utf8"));
const names = ["WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"];
for (const name of names) {
  if (!local[name]?.trim()) throw new Error(`Configure ${name} in .env first`);
}
// Send only the two required secrets to the official Wrangler command over
// stdin. Never put secret values in CLI arguments, output or tracked files.
const wrangler = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "secret",
    "bulk",
    "--profile",
    "zapcaster",
  ],
  {
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: resolve(".runtime/wrangler-logs"),
    },
  },
);
wrangler.stdin.end(
  JSON.stringify(Object.fromEntries(names.map((name) => [name, local[name]]))),
);
wrangler.on("error", () => {
  console.error("Failed to start Wrangler");
  process.exitCode = 1;
});
wrangler.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
