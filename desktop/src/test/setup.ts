import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals: false turns off Testing Library's own cleanup; without it renders pile up across tests.
afterEach(cleanup);

// jsdom has no ResizeObserver; Radix's Popover/Select/Tooltip primitives use it to measure
// content, so every test importing them needs at least a no-op stub.
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
