import React from "react";
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Message from "../src/components/Message.jsx";
import { UiContext } from "../src/context.jsx";
test("copies only message text with original newlines and displays internal read state", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard"),
    writeText = vi.fn().mockResolvedValue(undefined),
    notify = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  try {
    const message = {
      id: "m1",
      direction: "inbound",
      senderName: "Cliente",
      text: "Primeira linha\nSegunda linha",
      createdAt: "2026-11-17T12:00:00Z",
      viewedAt: null,
    };
    const view = render(
      <UiContext.Provider value={{ notify }}>
        <Message message={message} contactId={1} />
      </UiContext.Provider>,
    );
    expect(screen.getByText("Não lida")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Primeira linha\nSegunda linha"),
    );
    expect(notify).toHaveBeenCalledWith("Mensagem copiada.");
    view.rerender(
      <UiContext.Provider value={{ notify }}>
        <Message
          message={{ ...message, viewedAt: "2026-11-17T12:01:00Z" }}
          contactId={1}
        />
      </UiContext.Provider>,
    );
    expect(screen.getByText("Lida por você")).toBeDefined();
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else delete navigator.clipboard;
  }
});
