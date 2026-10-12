import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { experimentOn, useExperiment } from "./experiments";

it("is off by default and kept per window", () => {
  localStorage.clear();
  const { result } = renderHook(() => useExperiment("bubbles"));
  expect(result.current[0]).toBe(false);
  act(() => result.current[1](true));
  expect(result.current[0]).toBe(true);
  expect(experimentOn("bubbles")).toBe(true);
  act(() => result.current[1](false));
  expect(experimentOn("bubbles")).toBe(false);
});
