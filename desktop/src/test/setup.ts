import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount between tests (StandardDropdown's tests found two copies otherwise) and start every
// test at the home address: the app routes through window.location.hash, which jsdom keeps.
afterEach(() => {
  cleanup();
  window.location.hash = "";
});

// jsdom has no ResizeObserver; Radix's Popover/Select/Tooltip primitives use it to measure
// content, so every test importing them needs at least a no-op stub.
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
