import { resolve } from "node:path";
import { createWebhookServer, WEBHOOK_PATH } from "./webhook.mjs";
import { openWebhookStore } from "./webhook-store.mjs";

const port = Number(process.env.WEBHOOK_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("WEBHOOK_PORT must be between 1 and 65535");
}
const store = openWebhookStore(
  resolve(process.env.WEBHOOK_DB_PATH || ".runtime/whatsapp.sqlite"),
);
const server = createWebhookServer({
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  appSecret: process.env.META_APP_SECRET,
  store,
});
server.listen(port, process.env.WEBHOOK_HOST || "127.0.0.1", () => {
  console.log(`WhatsApp webhook listening on port ${port}${WEBHOOK_PATH}`);
  if (!process.env.WHATSAPP_VERIFY_TOKEN || !process.env.META_APP_SECRET) {
    console.log(
      "Configure WHATSAPP_VERIFY_TOKEN and META_APP_SECRET in .env to receive events.",
    );
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () =>
    server.close(() => {
      store.close();
    }),
  );
}
