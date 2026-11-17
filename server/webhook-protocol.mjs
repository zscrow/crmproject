export const WEBHOOK_PATH = "/webhooks/whatsapp";
export const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;

/**
 * @typedef {Record<string, unknown>} WebhookItem
 * @typedef {{metadata?: {phone_number_id?: string} | null, messages?: WebhookItem[], statuses?: WebhookItem[], [key: string]: unknown}} WebhookValue
 * @typedef {{object: 'whatsapp_business_account', entry: {id: string, changes: {field: string, value: WebhookValue}[]}[]}} WebhookPayload
 * @typedef {{accountId: string, field: string, kind: string, payload: WebhookItem, identity: string, payloadPath: string}} WebhookEvent
 */

/** @param {unknown} value @returns {value is WebhookItem} */
const record = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** @param {unknown} value @returns {value is WebhookValue} */
function validValue(value) {
  return (
    record(value) &&
    (value.metadata == null ||
      (record(value.metadata) &&
        (value.metadata.phone_number_id === undefined ||
          typeof value.metadata.phone_number_id === "string"))) &&
    ["messages", "statuses"].every(
      (key) =>
        value[key] === undefined ||
        (Array.isArray(value[key]) && value[key].every(record)),
    )
  );
}

/** @param {unknown} payload @returns {payload is WebhookPayload} */
export function validPayload(payload) {
  return (
    record(payload) &&
    payload.object === "whatsapp_business_account" &&
    Array.isArray(payload.entry) &&
    payload.entry.every(
      (entry) =>
        record(entry) &&
        typeof entry.id === "string" &&
        entry.id.length <= 256 &&
        Array.isArray(entry.changes) &&
        entry.changes.every(
          (change) =>
            record(change) &&
            typeof change.field === "string" &&
            change.field.length <= 128 &&
            validValue(change.value),
        ),
    )
  );
}

// A stable event identity deduplicates re-delivery even when Meta regroups a batch.
/** @param {WebhookPayload} payload @returns {Generator<WebhookEvent>} */
export function* webhookEvents(payload) {
  for (const [entryIndex, entry] of payload.entry.entries()) {
    for (const [changeIndex, change] of entry.changes.entries()) {
      const value = change.value;
      const scope = [
        entry.id,
        value.metadata?.phone_number_id ?? "",
        change.field,
      ];
      const path = `$.entry[${entryIndex}].changes[${changeIndex}].value`;
      /** @type {(kind: string, item: WebhookItem, identity: unknown, payloadPath: string) => WebhookEvent} */
      const make = (kind, item, identity, payloadPath) => ({
        accountId: entry.id,
        field: change.field,
        kind,
        payload: item,
        identity: JSON.stringify([...scope, kind, identity]),
        payloadPath,
      });
      for (const [i, message] of (value.messages ?? []).entries()) {
        yield make(
          "message",
          message,
          message.id ?? message,
          `${path}.messages[${i}]`,
        );
      }
      for (const [i, status] of (value.statuses ?? []).entries()) {
        yield make(
          "status",
          status,
          [status.id, status.status, status.timestamp],
          `${path}.statuses[${i}]`,
        );
      }
      if (!value.messages?.length && !value.statuses?.length) {
        yield make("change", value, value, path);
      }
    }
  }
}
