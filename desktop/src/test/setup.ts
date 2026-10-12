import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Every test starts with an empty document: renders never leak from one test into the next.
afterEach(cleanup);

// findBy/waitFor wait up to 4s: a deadline, not a sleep; 1s ran out under a full parallel run.
configure({ asyncUtilTimeout: 4000 });
