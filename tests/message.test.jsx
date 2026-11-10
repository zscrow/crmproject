import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Message from "../src/components/Message.jsx";
import { UiContext } from "../src/context.jsx";
vi.mock("../src/services/media.mjs", () => ({
  assetUrl: async () => "blob:test-voice",
}));
it("shows the native voice player without exposing the technical filename", async () => {
  render(
    <UiContext.Provider value={{ setViewer: () => {} }}>
      <Message
        contactId={1}
        message={{
          direction: "outbound",
          senderName: "André Saulo",
          text: "audio-123.webm",
          attachments: [
            { kind: "audio", name: "audio-123.webm", mediaId: "voice" },
          ],
        }}
      />
    </UiContext.Provider>,
  );
  expect(screen.getByText("Mensagem de voz")).toBeTruthy();
  expect(screen.queryByText("audio-123.webm")).toBeNull();
  expect(screen.getByLabelText("Mensagem de voz de André Saulo").tagName).toBe(
    "AUDIO",
  );
});
