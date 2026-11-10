import React from "react";
import { describe, it, expect } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import App from "../src/App.jsx";
import { createCrmStore, initialState } from "../src/store.mjs";
const mount = () => {
  const store = createCrmStore({ storage: localStorage });
  render(<App store={store} />);
  return store;
};
describe("React CRM flows", () => {
  it("opens a whole attendance card and expands /ola as typed without submitting", () => {
    const store = mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Abrir atendimento de Mariana Costa",
      }),
    );
    const input = screen.getByRole("textbox", { name: "Mensagem" });
    fireEvent.change(input, { target: { value: "/ola", selectionStart: 4 } });
    expect(input.value).toContain("Olá, Mariana Costa!");
    expect(input.value).toContain("André Saulo");
    expect(store.getSnapshot().messages[1].length).toBe(1);
  });
  it("keeps a note open on outside click and asks before discarding via Cancel", () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Abrir atendimento de Mariana Costa",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Anotações" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Anotação" }), {
      target: { value: "Anotação não salva" },
    });
    fireEvent.mouseDown(document.querySelector(".modal-backdrop"));
    fireEvent.click(document.querySelector(".modal-backdrop"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "alterações não salvas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("textbox", { name: "Anotação" }).value).toBe(
      "Anotação não salva",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("finds an existing contact using a differently formatted phone", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Novo cliente" }));
    fireEvent.change(screen.getByLabelText("Telefone com DDD"), {
      target: { value: "11 98765 4320" },
    });
    expect(
      screen.getByRole("button", { name: "Abrir conversa existente" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar" }).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir conversa existente" }),
    );
    expect(screen.getByRole("heading", { name: "Mariana Costa" })).toBeTruthy();
  });
  it("preserves legacy storage, message authors and multi-sector profiles", () => {
    const old = initialState(localStorage);
    old.contacts[0].name = "Contato preservado";
    old.messages[1] = [
      {
        id: "old",
        direction: "outbound",
        senderName: "Autor antigo",
        text: "Histórico salvo",
        createdAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem("zc-contacts", JSON.stringify(old.contacts));
    localStorage.setItem("zc-messages", JSON.stringify(old.messages));
    const store = mount();
    expect(store.getSnapshot().contacts[0].name).toBe("Contato preservado");
    expect(store.getSnapshot().messages[1][0].senderName).toBe("Autor antigo");
  });
  it("changes visibility with the staff profile and hides administrative navigation", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Atendente em uso"), {
      target: { value: "andre" },
    });
    expect(
      screen.queryByRole("button", { name: "Equipe", exact: true }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Abrir atendimento de Camila Rodrigues",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Abrir atendimento de Mariana Costa",
      }),
    ).toBeTruthy();
  });
});
it("quick conversation sidebar contains only the active agents open cases", () => {
  const store = mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir atendimento de Mariana Costa" }),
  );
  const quick = within(document.querySelector(".conversation-list"));
  expect(quick.getByRole("button", { name: /Mariana Costa/ })).toBeTruthy();
  expect(quick.queryByRole("button", { name: /Rafael Almeida/ })).toBeNull();
  store.actions.transfer(1, "Arte", "andre");
  expect(store.getSnapshot().contacts[0].assigneeId).toBe("andre");
});
it("starts in Automatic with the requested sector order", () => {
  mount();
  const shelf = document.querySelector(".sector-quickbar");
  expect(
    within(shelf)
      .getAllByRole("button")
      .map((b) => b.textContent.replace(/\d+/g, "").trim()),
  ).toEqual([
    "Automático",
    "Impressão",
    "Arte",
    "E-commerce",
    "Triagem",
    "Financeiro",
  ]);
  expect(
    within(shelf)
      .getByRole("button", { name: /Automático/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
it("lists slash commands, filters similar shortcuts and inserts with the keyboard", () => {
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir atendimento de Mariana Costa" }),
  );
  const input = screen.getByRole("textbox", { name: "Mensagem" });
  fireEvent.change(input, { target: { value: "/", selectionStart: 1 } });
  expect(
    screen.getByRole("listbox", { name: "Comandos disponíveis" }),
  ).toBeTruthy();
  expect(
    screen.getAllByRole("option").filter((o) => o.id.startsWith("command-"))
      .length,
  ).toBe(3);
  fireEvent.change(input, { target: { value: "/ol", selectionStart: 3 } });
  expect(screen.getByRole("option", { name: /\/ola/ })).toBeTruthy();
  expect(screen.queryByRole("option", { name: /\/pix/ })).toBeNull();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input.value).toContain("Olá, Mariana Costa!");
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("replies quoting the selected message and saves the reference", async () => {
  const store = mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir atendimento de Mariana Costa" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Responder citando mensagem de Mariana Costa",
    }),
  );
  expect(
    screen.getByRole("region", { name: "Respondendo à mensagem" }).textContent,
  ).toContain("Mariana Costa");
  fireEvent.change(screen.getByRole("textbox", { name: "Mensagem" }), {
    target: { value: "Sim, vamos preparar o orçamento.", selectionStart: 33 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await waitFor(() =>
    expect(store.getSnapshot().messages[1].at(-1).replyTo?.messageId).toBe(
      "seed-1",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Ver mensagem citada" }).textContent,
  ).toContain("Mariana Costa");
  expect(
    screen.queryByRole("region", { name: "Respondendo à mensagem" }),
  ).toBeNull();
});
it("can cancel a quote without clearing the text", () => {
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir atendimento de Mariana Costa" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Responder citando mensagem de Mariana Costa",
    }),
  );
  const input = screen.getByRole("textbox", { name: "Mensagem" });
  fireEvent.change(input, { target: { value: "Rascunho", selectionStart: 8 } });
  fireEvent.click(
    screen.getByRole("button", { name: "Cancelar resposta citada" }),
  );
  expect(input.value).toBe("Rascunho");
  expect(
    screen.queryByRole("region", { name: "Respondendo à mensagem" }),
  ).toBeNull();
});
it("filters own cases beside search without the former attendance tabs", () => {
  mount();
  expect(document.querySelector(".service-tabs")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Só meus atendimentos" }));
  expect(
    screen.getByRole("button", { name: "Abrir atendimento de Mariana Costa" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", {
      name: "Abrir atendimento de Rafael Almeida",
    }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(
    screen.getByRole("button", { name: "Abrir atendimento de Rafael Almeida" }),
  ).toBeTruthy();
});
it("renders inline day dividers in history without a floating date", () => {
  const seed = initialState(localStorage);
  const today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  seed.messages[1] = [
    {
      id: "old",
      direction: "inbound",
      senderName: "Mariana Costa",
      text: "Ontem",
      createdAt: yesterday.toISOString(),
    },
    {
      id: "new",
      direction: "inbound",
      senderName: "Mariana Costa",
      text: "Hoje",
      createdAt: today.toISOString(),
    },
  ];
  const store = createCrmStore({ storage: localStorage, seed });
  render(<App store={store} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir atendimento de Mariana Costa" }),
  );
  expect(
    [...document.querySelectorAll(".conversation-day-label")].map(
      (n) => n.textContent,
    ),
  ).toEqual(["Ontem", "Hoje"]);
  expect(document.querySelectorAll(".conversation-active-day").length).toBe(0);
  expect(document.querySelectorAll(".conversation-day").length).toBe(2);
});
