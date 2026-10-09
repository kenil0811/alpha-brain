import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "./client";
import { PREF, forgetPreferences, usePreference } from "./preferences";

/** A core that keeps preferences in a map, and can be told to refuse a write. */
function fakeCore(stored: Record<string, unknown> = {}, refuse = false) {
  const setPreference = vi.fn(async (key: string, value: unknown) => {
    if (refuse) throw new Error("The core said no.");
    stored[key] = value;
    return { key, value };
  });
  const client = { preference: vi.fn(async (key: string) => ({ key, value: stored[key] ?? null })), setPreference } as unknown as Client;
  return { client, setPreference };
}

describe("preferences", () => {
  beforeEach(forgetPreferences);

  it("start at the fallback, then show what the core holds", async () => {
    const { client } = fakeCore({ [PREF.workspaceName]: "Home base" });
    const { result } = renderHook(() => usePreference(client, PREF.workspaceName, "Alpha"));
    expect(result.current[0]).toBe("Alpha");
    await waitFor(() => expect(result.current[0]).toBe("Home base"));
  });

  it("share one cache: a change in one reader reaches every other at once, and a new reader starts from it", async () => {
    const { client, setPreference } = fakeCore();
    const one = renderHook(() => usePreference<string[]>(client, PREF.moduleOrder, []));
    const two = renderHook(() => usePreference<string[]>(client, PREF.moduleOrder, []));
    await act(async () => {
      expect(await one.result.current[1](["m_b", "m_a"])).toBeNull();
    });
    expect(setPreference).toHaveBeenCalledWith(PREF.moduleOrder, ["m_b", "m_a"]);
    expect(two.result.current[0]).toEqual(["m_b", "m_a"]);
    // a reader with no client of its own (a module's icon on Home) still sees it
    const three = renderHook(() => usePreference<string[]>(null, PREF.moduleOrder, []));
    expect(three.result.current[0]).toEqual(["m_b", "m_a"]);
  });

  it("a failed write puts the old value back for every reader and says what went wrong", async () => {
    const { client } = fakeCore({ [PREF.hiddenModules]: ["m_a"] }, true);
    const one = renderHook(() => usePreference<string[]>(client, PREF.hiddenModules, []));
    const two = renderHook(() => usePreference<string[]>(client, PREF.hiddenModules, []));
    await waitFor(() => expect(two.result.current[0]).toEqual(["m_a"]));
    let problem: string | null = null;
    await act(async () => {
      problem = await one.result.current[1](["m_a", "m_b"]);
    });
    expect(problem).toBe("The core said no.");
    expect(one.result.current[0]).toEqual(["m_a"]);
    expect(two.result.current[0]).toEqual(["m_a"]);
  });

  it("cannot be changed with no core", async () => {
    const { result } = renderHook(() => usePreference<string>(null, PREF.workspaceName, "Alpha"));
    let problem: string | null = null;
    await act(async () => {
      problem = await result.current[1]("Elsewhere");
    });
    expect(problem).toMatch(/isn't running/);
    expect(result.current[0]).toBe("Alpha");
  });
});
