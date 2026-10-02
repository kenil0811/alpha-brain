/** Saved views: the client's calls to the core, the hook's create/rename/delete, and lists the
 * older page kept in this window's storage moving into the core once. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, type SavedView } from "../core/client";
import type { FieldInfo } from "../modules/fields";
import { applyFilters } from "./engine";
import { legacyKey, legacyToConfig, useSavedViews } from "./useSavedViews";

const fields: FieldInfo[] = [
  { name: "name", kind: "text" },
  { name: "stage", kind: "status", choices: ["sourced", "won", "lost"], done_choices: ["won", "lost"] },
];
const view = (id: string, title: string, config: object = { kind: "table" }): SavedView =>
  ({ id, collection: "deals", title, config, is_default: false, created_by: "person", created_at: "", updated_at: "" }) as SavedView;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("client", () => {
  it("speaks the views endpoints", async () => {
    const calls: [string, string, unknown][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([init.method ?? "GET", url, init.body ? JSON.parse(String(init.body)) : undefined]);
        return new Response(JSON.stringify(view("v1", "Hot")), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const client = new Client({ baseUrl: "http://core", token: "t" });
    await client.views("deals");
    await client.saveView("deals", "Hot", { kind: "board" });
    await client.updateView("v1", { title: "Hotter" });
    await client.deleteView("v1");
    expect(calls).toEqual([
      ["GET", "http://core/api/tables/deals/views", undefined],
      ["POST", "http://core/api/tables/deals/views", { title: "Hot", config: { kind: "board" }, is_default: false }],
      ["PATCH", "http://core/api/views/v1", { title: "Hotter" }],
      ["DELETE", "http://core/api/views/v1", undefined],
    ]);
  });
});

function fakeClient() {
  let n = 0;
  return {
    saveView: vi.fn(async (_t: string, title: string, config: object) => view(`v${++n}`, title, config)),
    updateView: vi.fn(async (id: string, patch: { title?: string }) => view(id, patch.title ?? "x")),
    deleteView: vi.fn(async (id: string) => ({ deleted: id })),
  };
}

describe("useSavedViews", () => {
  it("creates, renames and deletes, and reports a refusal in words", async () => {
    const client = fakeClient();
    const none: SavedView[] = [];
    const { result } = renderHook(() => useSavedViews(client as unknown as Client, "deals", fields, none));
    await act(async () => void (await result.current.save("Hot", { kind: "table" })));
    expect(result.current.views.map((v) => v.title)).toEqual(["Hot"]);
    await act(async () => void (await result.current.update("v1", { title: "Hotter" })));
    expect(result.current.views.map((v) => v.title)).toEqual(["Hotter"]);
    await act(async () => void (await result.current.remove("v1")));
    expect(result.current.views).toEqual([]);
    client.saveView.mockRejectedValueOnce(new Error("A list called Hot already exists."));
    await act(async () => void (await result.current.save("Hot", {})));
    expect(result.current.error).toBe("A list called Hot already exists.");
  });

  it("moves the older page's lists into the core once and forgets them", async () => {
    localStorage.setItem(
      legacyKey("deals"),
      JSON.stringify([
        { title: "Open", hideDone: true, hidden: ["notes"] },
        { title: "Kept", filters: { stage: "sourced" } },
      ]),
    );
    const client = fakeClient();
    // The table's views as loaded: one object for the life of the load, as DataViews passes it.
    const loaded = [view("v0", "Kept")];
    const { result } = renderHook(() => useSavedViews(client as unknown as Client, "deals", fields, loaded));
    await waitFor(() => expect(result.current.views.map((v) => v.title)).toEqual(["Kept", "Open"]));
    expect(client.saveView).toHaveBeenCalledTimes(1);
    expect(client.saveView.mock.calls[0]![2]).toMatchObject({ hidden: ["notes"], rowFilters: [{ field: "stage", op: "is_none_of", value: "won, lost" }] });
    expect(localStorage.getItem(legacyKey("deals"))).toBeNull();
  });

  it("turns an older list into filters that select the same rows", () => {
    const config = legacyToConfig({ title: "x", filters: { stage: "sourced" }, search: "ember" }, fields);
    expect(config).toMatchObject({ kind: "table", search: "ember", rowFilters: [{ field: "stage", op: "is", value: "sourced" }] });
    const open = legacyToConfig({ title: "y", hideDone: true }, fields);
    const rows = [{ id: "1", stage: "won" }, { id: "2", stage: "sourced" }, { id: "3", stage: "lost" }];
    expect(applyFilters(rows, open.rowFilters!).map((r) => r.id)).toEqual(["2"]);
  });
});
