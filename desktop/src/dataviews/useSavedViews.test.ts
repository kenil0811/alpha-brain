/** Saved lists: kept per table in this window's storage, one starred at a time. */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { listsKey, useSavedViews } from "./useSavedViews";

beforeEach(() => localStorage.clear());

describe("useSavedViews", () => {
  it("saves, stars one list at a time, renames and deletes, and remembers them", async () => {
    const { result, rerender } = renderHook(() => useSavedViews("deals"));
    let a = await act(() => result.current.save("Hot", { kind: "table" }));
    rerender();
    const b = await act(() => result.current.save("Cold", { kind: "board" }));
    rerender();
    await act(() => result.current.update(a.id, { is_default: true }));
    rerender();
    await act(() => result.current.update(b.id, { is_default: true }));
    rerender();
    expect(result.current.views.map((v) => [v.title, v.is_default])).toEqual([["Hot", false], ["Cold", true]]);
    a = (await act(() => result.current.update(a.id, { title: "Warm" })))!;
    rerender();
    expect(a.title).toBe("Warm");
    await act(() => result.current.remove(b.id));
    rerender();
    expect(JSON.parse(localStorage.getItem(listsKey("deals"))!).map((v: { title: string }) => v.title)).toEqual(["Warm"]);
    expect(renderHook(() => useSavedViews("deals")).result.current.views).toHaveLength(1);
  });
});
