import React from "react";
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../src/App.jsx";
import { createCrmStore, initialState } from "../src/store.mjs";
test("reads require focus and marking unread does not immediately mark the conversation read again", async () => {
  vi.useFakeTimers();
  const focused = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const state = initialState(localStorage);
  state.contacts[0].unreadCount = 1;
  const store = createCrmStore({ storage: localStorage, seed: state });
  store.cloud = true;
  const metadata = {
    workspace: { id: "w", name: "Klivo" },
    workspaces: [{ id: "w", name: "Klivo" }],
    status: "saved",
  };
  store.getCloudSnapshot = () => metadata;
  store.setViewed = vi.fn().mockResolvedValue(undefined);
  const view = render(<App store={store} />);
  try {
    fireEvent.click(
      screen.getByRole("button", {
        name: "Abrir atendimento de Mariana Costa",
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(store.setViewed).not.toHaveBeenCalled();
    focused.mockReturnValue(true);
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(store.setViewed).toHaveBeenCalledWith(1, ["seed-1"], true);
    store.setViewed.mockClear();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Marcar como não lida" }),
      );
    });
    expect(store.setViewed).toHaveBeenCalledWith(1, ["seed-1"], false);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(store.setViewed).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
