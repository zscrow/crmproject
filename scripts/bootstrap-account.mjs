import fs from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { hashPassword, randomToken } from "../server/crm/auth.mjs";
const local = parseEnv(fs.readFileSync(".env", "utf8"));
local.KLIVO_ADMIN_EMAIL ||= "scrowlly.contact@gmail.com";
local.KLIVO_ADMIN_PASSWORD ||= randomBytes(24).toString("base64url");
fs.writeFileSync(
  ".env",
  Object.entries(local)
    .map(([key, value]) => key + "=" + JSON.stringify(value))
    .join(String.fromCharCode(10)) + String.fromCharCode(10),
);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const salt = randomToken(),
  hash = await hashPassword(local.KLIVO_ADMIN_PASSWORD, salt);
const sql = `INSERT OR IGNORE INTO klivo_users (id,email,name,company,password_hash,salt,role,created_at) VALUES (${[crypto.randomUUID(), local.KLIVO_ADMIN_EMAIL, "André Saulo", "Klivo", hash, salt, "owner", Date.now()].map(quote).join(",")});`;
fs.mkdirSync(".runtime", { recursive: true });
const file = ".runtime/bootstrap-owner.sql";
fs.writeFileSync(file, sql, { mode: 0o600 });
try {
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "klivo-webhooks",
      "--remote",
      "--config",
      "wrangler.app.jsonc",
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
  console.log(
    "Conta administradora preparada. Credenciais em KLIVO_ADMIN_EMAIL e KLIVO_ADMIN_PASSWORD no .env.",
  );
} finally {
  fs.unlinkSync(file);
}
