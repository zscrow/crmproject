import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";
const local = parseEnv(readFileSync(".env", "utf8"));
const names = [
  "META_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TEST_RECIPIENT",
];
mkdirSync(".runtime", { recursive: true });
const file = `.runtime/app-secrets-${randomUUID()}.json`;
writeFileSync(
  file,
  JSON.stringify(
    Object.fromEntries(
      names.filter((n) => local[n]?.trim()).map((n) => [n, local[n]]),
    ),
  ),
  { flag: "wx", mode: 0o600 },
);
try {
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy",
        "--config",
        "wrangler.app.jsonc",
        "--secrets-file",
        file,
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  unlinkSync(file);
}
