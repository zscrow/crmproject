import test from "node:test";
import assert from "node:assert/strict";
import { createRecorder } from "../src/services/recorder.mjs";
function fake() {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      this.state = "inactive";
      this.mimeType = "audio/webm";
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob(["voice"]) });
      this.onstop();
    }
  }
  return { stream, Recorder, stopped: () => stopped };
}
test("recording produces a playable blob and releases microphone tracks", async () => {
  const f = fake(),
    drafts = [];
  const recorder = createRecorder({
    getUserMedia: async () => f.stream,
    Recorder: f.Recorder,
    onDraft: (d) => drafts.push(d),
  });
  await recorder.start();
  assert.ok(recorder.getState());
  recorder.stop();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].blob.type, "audio/webm");
  assert.equal(await drafts[0].blob.text(), "voice");
  assert.ok(f.stopped() > 0);
  assert.equal(recorder.getState(), null);
});
test("cancel and navigation disposal never create a draft", async () => {
  for (const method of ["cancel", "dispose"]) {
    const f = fake(),
      drafts = [];
    const r = createRecorder({
      getUserMedia: async () => f.stream,
      Recorder: f.Recorder,
      onDraft: (d) => drafts.push(d),
    });
    await r.start();
    method === "cancel" ? r.stop(true) : r.dispose();
    assert.equal(drafts.length, 0);
    assert.ok(f.stopped() > 0);
  }
});
test("late microphone permission after navigation releases the stream", async () => {
  const f = fake();
  let resolve;
  const r = createRecorder({
    getUserMedia: () => new Promise((r) => (resolve = r)),
    Recorder: f.Recorder,
  });
  const start = r.start();
  r.dispose();
  resolve(f.stream);
  await start;
  assert.ok(f.stopped() > 0);
  assert.equal(r.getState(), null);
});
test("microphone denial returns an actionable error", async () => {
  let message;
  const r = createRecorder({
    getUserMedia: async () => {
      throw Object.assign(new Error(), { name: "NotAllowedError" });
    },
    Recorder: fake().Recorder,
    onError: (e) => (message = e.message),
  });
  await r.start();
  assert.match(message, /Permita o microfone/);
});
