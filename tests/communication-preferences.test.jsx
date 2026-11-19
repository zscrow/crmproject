import React from "react";
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoreContext, UiContext } from "../src/context.jsx";
import { createCrmStore } from "../src/store.mjs";
import CommunicationPreferences from "../src/components/CommunicationPreferences.jsx";
import Contacts from "../src/pages/Contacts.jsx";
import { blockedFor } from "../src/domain/communication.mjs";

test("an external opt-out is saved through the form; revoked contacts leave active lists and remain accessible in history", async () => {
  const store = createCrmStore({ storage: localStorage });
  const contact = store.getSnapshot().contacts[0];
  const ui = { setDialog: vi.fn(), notify: vi.fn(), openConversation: vi.fn() };
  const mount = (element) =>
    render(
      <StoreContext.Provider value={store}>
        <UiContext.Provider value={ui}>{element}</UiContext.Provider>
      </StoreContext.Provider>,
    );
  const modal = mount(<CommunicationPreferences contact={contact} />);
  fireEvent.change(screen.getByLabelText("Tipo de registro"), {
    target: { value: "revoke" },
  });
  fireEvent.change(screen.getByLabelText("Canal de origem"), {
    target: { value: "email" },
  });
  fireEvent.change(screen.getByLabelText("Evidência ou referência do pedido"), {
    target: { value: "Pedido recebido pelo e-mail do cliente" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar preferência" }));
  await waitFor(() => expect(ui.setDialog).toHaveBeenCalledWith(null));
  expect(blockedFor(store.getSnapshot(), contact)).toBeTruthy();
  modal.unmount();
  mount(<Contacts />);
  expect(
    screen.queryByRole("group", { name: `Cliente ${contact.name}` }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Descadastrados/ }));
  expect(
    screen.getByRole("group", { name: `Cliente ${contact.name}` }),
  ).toBeDefined();
});
