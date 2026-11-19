import React from "react";
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Demo, { demoStorage } from "../src/Demo.jsx";
test("local demo isolates browser data and opens without calling a server or Meta", () => {
  localStorage.setItem("zc-contacts", "production-data-must-stay-untouched");
  const fetcher = vi.fn(() => {
    throw new Error("Network forbidden in demo");
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const isolated = demoStorage(localStorage);
    isolated.setItem("example", "demo-only");
    expect(localStorage.getItem("example")).toBeNull();
    expect(isolated.getItem("example")).toBe("demo-only");
    render(<Demo />);
    expect(
      screen.getByText("Demonstração local · sem envios reais"),
    ).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: "Abrir atendimento de Mariana Costa",
      }),
    ).toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(localStorage.getItem("zc-contacts")).toBe(
      "production-data-must-stay-untouched",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
