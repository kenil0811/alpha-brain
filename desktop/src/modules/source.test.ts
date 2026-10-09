import { describe, expect, it, vi } from "vitest";
import type { Client, RecordRow } from "../core/client";
import { parseCsv, toCsv } from "./csv";
import { memorySource, reasonFor } from "./source";

const row = (id: string, name: string): RecordRow => ({ id, revision: 1, values: { name }, created_at: "", updated_at: "", provenance: {} });

function prefs() {
  const kept: Record<string, unknown> = {};
  return {
    kept,
    client: {
      preference: vi.fn(async (key: string) => ({ key, value: kept[key] ?? null })),
      setPreference: vi.fn(async (key: string, value: unknown) => {
        kept[key] = value;
        return { key, value };
      }),
    } as unknown as Client,
  };
}

describe("a source over rows the window holds", () => {
  it("loads its rows and keeps its lists in the window-lists preference, by its key", async () => {
    const { client, kept } = prefs();
    const src = memorySource({ client, key: "agents", title: "Agents", fields: [{ name: "name", kind: "text" }], rows: () => [row("a", "Alpha")] });
    expect((await src.load()).records.map((r) => r.id)).toEqual(["a"]);
    const made = await src.saveList!("Mine", { search: "al" });
    const other = await src.saveList!("Other", {});
    await src.updateList!(other.id, { default: true });
    expect((kept.window_lists as Record<string, { title: string; is_default: boolean }[]>).agents.map((l) => [l.title, l.is_default])).toEqual([["Mine", false], ["Other", true]]);
    await src.deleteList!(made.id);
    expect((await src.load()).lists?.map((l) => l.title)).toEqual(["Other"]);
  });

  it("has no abilities it was not given, each with its reason", () => {
    const src = memorySource({ client: null, key: "skills", title: "Skills", fields: [], rows: () => [], reasons: { edit: "Alpha writes skills." } });
    expect(src.edit).toBeUndefined();
    expect(src.saveList).toBeUndefined();
    expect(reasonFor(src, "edit")).toBe("Alpha writes skills.");
    expect(reasonFor(src, "lists")).toBe("Alpha's core isn't running.");
  });
});

describe("csv", () => {
  it("reads quoted cells and writes them back", () => {
    const grid = parseCsv('name,note\r\nBakery,"says ""hi"", twice"\nCafe,\n');
    expect(grid).toEqual([["name", "note"], ["Bakery", 'says "hi", twice'], ["Cafe", ""]]);
    expect(parseCsv(toCsv(grid))).toEqual(grid);
  });
});
