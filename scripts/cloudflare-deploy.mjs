import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const local = parseEnv(readFileSync(".env", "utf8"));
const names = ["WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"];
for (const name of names) {
  if (!local[name]?.trim()) throw new Error(`Configure ${name} in .env first`);
}
mkdirSync(".runtime", { recursive: true });
const filename = resolve(".runtime", `cloudflare-secrets-${randomUUID()}.json`);
// Wrangler requires a secrets file for the first deployment. Include only the
// required keys in an ignored temporary file, and remove it after the command.
writeFileSync(filename, JSON.stringify(Object.fromEntries(names.map(name => [name, local[name]]))), { flag:"wx", mode:0o600 });
try {
  const code = await new Promise((resolveExit, reject) => {
    const wrangler = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--profile", "zapcaster", "--secrets-file", filename], {
      stdio:"inherit", env:{...process.env, WRANGLER_LOG_PATH:resolve(".runtime/wrangler-logs")},
    });
    wrangler.on("error", reject);
    wrangler.on("exit", code => resolveExit(code ?? 1));
  });
  process.exitCode = code;
} finally { unlinkSync(filename); }
