import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { forgetPreferences } from "../core/preferences";

// Every test starts with an empty document, an empty session and no kept preferences: renders,
// a page's kept working state and the person's choices never leak from one test into the next.
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  forgetPreferences();
});
