import React from "react";
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Message from "../src/components/Message.jsx";
import { UiContext } from "../src/context.jsx";

test("an API acceptance never renders as delivery and webhook failures remain visible", () => {
  const message = {
    id: "out-1",
    source: "whatsapp",
    direction: "outbound",
    text: "Resposta",
    senderName: "Atendente",
    createdAt: new Date().toISOString(),
    delivery: "accepted",
  };
  const renderMessage = (m) => (
    <UiContext.Provider value={{ notify: () => {} }}>
      <Message contactId={1} message={m} />
    </UiContext.Provider>
  );
  const view = render(renderMessage(message));
  expect(
    screen.getByText("Aceita pela Meta · aguardando entrega"),
  ).toBeDefined();
  expect(screen.queryByText("Entregue")).toBeNull();
  view.rerender(
    renderMessage({
      ...message,
      delivery: "failed",
      deliveryError: "A Meta bloqueou o envio (130497).",
    }),
  );
  expect(screen.getByRole("alert").textContent).toContain("Não entregue");
  expect(screen.getByRole("alert").textContent).toContain("130497");
  view.rerender(renderMessage({ ...message, delivery: "unknown" }));
  expect(screen.getByText(/Envio sem confirmação/)).toBeDefined();
  view.rerender(renderMessage({ ...message, delivery: "delivered" }));
  expect(screen.getByText("Entregue")).toBeDefined();
});
