import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
window.scrollTo = () => {};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => {};
