import fs from "node:fs";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
const env = parseEnv(fs.readFileSync(".env", "utf8"));
for (const name of ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID"])
  if (!/^\d+$/.test(env[name] || ""))
    throw new Error("Configure " + name + " no .env.");
if (!env.KLIVO_ADMIN_EMAIL)
  throw new Error("Configure KLIVO_ADMIN_EMAIL no .env.");
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
function query(sql) {
  const raw = execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--config",
      "wrangler.app.jsonc",
      "--json",
      "--command",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(raw).flatMap((entry) => entry.results || []);
}
const target = env.KLIVO_TEST_WORKSPACE_ID
  ? quote(env.KLIVO_TEST_WORKSPACE_ID)
  : "'workspace-' || u.id";
const rows = query(
  `SELECT w.id FROM klivo_workspaces w JOIN klivo_memberships m ON m.workspace_id=w.id JOIN klivo_users u ON u.id=m.user_id WHERE u.email=${quote(env.KLIVO_ADMIN_EMAIL)} AND u.role='owner' AND m.role='admin' AND w.id=${target}`,
);
if (rows.length !== 1)
  throw new Error(
    "Não foi possível identificar sua empresa. Configure KLIVO_TEST_WORKSPACE_ID explicitamente.",
  );
const workspace = rows[0].id,
  phone = env.WHATSAPP_PHONE_NUMBER_ID;
const existing = query(
  `SELECT workspace_id FROM klivo_whatsapp_connections WHERE phone_number_id=${quote(phone)}`,
);
if (existing.length && existing[0].workspace_id !== workspace)
  throw new Error(
    "Este número já pertence a outra empresa. Nenhuma associação foi alterada.",
  );
query(
  `INSERT INTO klivo_whatsapp_connections (phone_number_id,account_id,workspace_id,sector,created_at) VALUES (${quote(phone)},${quote(env.WHATSAPP_BUSINESS_ACCOUNT_ID)},${quote(workspace)},'Triagem',${Date.now()}) ON CONFLICT(phone_number_id) DO NOTHING`,
);
const verified = query(
  `SELECT workspace_id,account_id FROM klivo_whatsapp_connections WHERE phone_number_id=${quote(phone)}`,
);
if (
  verified[0]?.workspace_id !== workspace ||
  verified[0]?.account_id !== env.WHATSAPP_BUSINESS_ACCOUNT_ID
)
  throw new Error(
    "Associação divergente. Confira a conta WhatsApp configurada.",
  );
console.log(
  "Número de teste associado à empresa administradora. Nenhuma mensagem foi enviada.",
);
