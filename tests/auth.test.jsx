import React from "react";
import { test, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Auth from "../src/Auth.jsx";
import { initialState } from "../src/store.mjs";
afterEach(() => vi.unstubAllGlobals());
test("signed-out visitors see login without public registration", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Entre na sua conta." }),
    })),
  );
  render(<Auth />);
  await screen.findByRole("button", { name: "Entrar no Klivo" });
  expect(screen.queryByText("Atendente · demo")).toBeNull();
  expect(screen.queryByRole("button", { name: /Criar conta/ })).toBeNull();
  expect(screen.queryByLabelText("Seu nome")).toBeNull();
  expect(screen.getByLabelText("E-mail ou usuário")).toBeDefined();
});
test("restored sessions render their account even when the demo agent is staff", async () => {
  localStorage.setItem(
    "klivo:owner-id:zc-active-agent",
    JSON.stringify("luiza"),
  );
  const user = {
    id: "owner-id",
    name: "Owner",
    company: "Klivo",
    email: "owner@example.com",
    role: "owner",
  };
  const state = initialState({ getItem: () => null });
  state.contacts = [];
  state.messages = {};
  state.team = [
    {
      id: user.id,
      name: user.name,
      role: "Administrador",
      allowedSectors: state.sectors,
    },
  ];
  state.activeAgentId = user.id;
  state.profile = { name: user.name, email: user.email, company: user.company };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/workspace")
          ? {
              state,
              revision: 0,
              workspace: { id: "w1", name: "Klivo", role: "admin" },
              workspaces: [{ id: "w1", name: "Klivo" }],
            }
          : { user },
    })),
  );
  render(<Auth />);
  await screen.findByRole("button", { name: "Sair", exact: true });
  expect(screen.getByText("owner@example.com")).toBeDefined();
  expect(screen.getAllByText("Klivo").length).toBeGreaterThan(0);
});
