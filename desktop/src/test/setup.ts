import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Radix's Popover/Select/Tooltip primitives use it to measure
// content, so every test importing them needs at least a no-op stub.
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
