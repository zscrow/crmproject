import React from "react";
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoreContext, UiContext } from "../src/context.jsx";
import { createCrmStore, initialState } from "../src/store.mjs";
import MetaTemplateDialog from "../src/components/MetaTemplates.jsx";
import { recordCommunication } from "../src/domain/communication.mjs";
test("Meta template dialog requires consent, previews variables and preserves inputs on rejection", async () => {
  const store = createCrmStore({
    storage: localStorage,
    seed: initialState(localStorage),
  });
  store.cloud = true;
  store.getCloudSnapshot = () => ({ workspace: { id: "w" } });
  store.listMetaTemplates = vi.fn().mockResolvedValue({
    templates: [
      {
        id: "hello",
        name: "hello_world",
        language: "en_US",
        status: "APPROVED",
        category: "UTILITY",
        components: [{ type: "BODY", text: "Hello static" }],
      },
      {
        id: "order",
        name: "order",
        language: "pt_BR",
        status: "APPROVED",
        category: "UTILITY",
        components: [{ type: "BODY", text: "Olá {{1}}, pedido {{2}}." }],
      },
      {
        id: "image",
        name: "photo",
        language: "en_US",
        status: "APPROVED",
        category: "MARKETING",
        components: [
          { type: "HEADER", format: "IMAGE" },
          { type: "BODY", text: "Photo" },
        ],
      },
    ],
  });
  store.actions.sendTemplate = vi
    .fn()
    .mockRejectedValue(new Error("Restrição da Meta (130497)."));
  const close = vi.fn();
  const contact = { id: 1, name: "Ana", phone: "+5511999999999" };
  recordCommunication(
    store.getSnapshot(),
    contact,
    {
      action: "grant",
      scope: "UTILITY",
      source: "form",
      occurredAt: new Date(Date.now() - 1000).toISOString(),
      purpose: "Atualizações sobre o pedido 123",
      evidence: "Formulário do pedido 123 autorizado pelo cliente",
    },
    { id: "admin", name: "Teste", role: "Administrador" },
  );
  render(
    <StoreContext.Provider value={store}>
      <UiContext.Provider value={{ setDialog: close, notify: vi.fn() }}>
        <MetaTemplateDialog contact={contact} />
      </UiContext.Provider>
    </StoreContext.Provider>,
  );
  await screen.findByText("Hello static");
  const send = screen.getByRole("button", { name: "Enviar template" });
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Modelo aprovado"), {
    target: { value: "order" },
  });
  fireEvent.change(screen.getByLabelText("Mensagem · 1"), {
    target: { value: "Ana" },
  });
  fireEvent.change(screen.getByLabelText("Mensagem · 2"), {
    target: { value: "123" },
  });
  expect(screen.getByText("Olá Ana, pedido 123.")).toBeDefined();
  fireEvent.click(
    screen.getByLabelText(
      "Este envio corresponde à finalidade autorizada abaixo",
    ),
  );
  fireEvent.click(send);
  await screen.findByText("Restrição da Meta (130497).");
  expect(store.actions.sendTemplate).toHaveBeenCalledWith(
    1,
    "order",
    { "body.1": "Ana", "body.2": "123" },
    true,
  );
  expect(screen.getByLabelText("Mensagem · 1").value).toBe("Ana");
  expect(close).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Modelo aprovado"), {
    target: { value: "image" },
  });
  expect(screen.getByLabelText("URL da imagem").type).toBe("url");
  expect(send.disabled).toBe(true);
  expect(screen.getByText(/Registre a autorização do cliente/)).toBeDefined();
});
