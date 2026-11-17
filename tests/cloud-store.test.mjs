import { test } from "node:test";
import assert from "node:assert/strict";
import { createCloudStore } from "../src/services/cloud-store.mjs";
const initial = () => ({
  state: { contacts: [], theme: "light", serviceSort: "unanswered" },
  revision: 0,
  workspace: { id: "w1", name: "Acme" },
  workspaces: [{ id: "w1", name: "Acme" }],
});
test("cloud edits only appear after server confirmation and serialize revisions", async (t) => {
  let release;
  const requests = [];
  const payload = initial();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
    return Response.json({
      ...payload,
      revision: requests.length,
      state: { ...payload.state, contacts: [{ id: requests.length }] },
      result: { ok: true },
    });
  });
  const store = createCloudStore(initial());
  const first = store.actions.favorite(1),
    second = store.actions.favorite(2);
  await Promise.resolve();
  assert.equal(store.getSnapshot().contacts.length, 0);
  assert.equal(store.getCloudSnapshot().status, "saving");
  assert.equal(requests.length, 1);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(
    requests.map((r) => r.revision),
    [0, 1],
  );
  assert.equal(store.getSnapshot().contacts[0].id, 2);
  assert.equal(store.getCloudSnapshot().status, "saved");
});
test("conflicts refresh authoritative state and preserve an actionable error", async (t) => {
  const payload = initial();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        ...payload,
        revision: 4,
        state: {
          ...payload.state,
          contacts: [{ id: 7, note: "Saved by another person" }],
        },
        error: "Os dados mudaram. Atualize e tente novamente.",
      },
      { status: 409 },
    ),
  );
  const store = createCloudStore(initial());
  await assert.rejects(store.actions.saveNote(7, "Unsaved"), /dados mudaram/);
  assert.equal(store.getSnapshot().contacts[0].note, "Saved by another person");
  assert.equal(store.getCloudSnapshot().status, "error");
});
test("network failures never report edits as saved or mutate the last snapshot", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Sem conexão");
  });
  const store = createCloudStore(initial());
  await assert.rejects(
    store.actions.saveContact({ name: "Offline" }),
    /Sem conexão/,
  );
  assert.equal(store.getSnapshot().contacts.length, 0);
  assert.equal(store.getCloudSnapshot().status, "error");
});
