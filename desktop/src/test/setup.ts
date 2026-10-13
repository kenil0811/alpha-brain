import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Every test starts with an empty document and an empty session: renders and a page's kept
// working state never leak from one test into the next.
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
