import { afterEach, describe, expect, it, vi } from "vitest";

let resized: (() => void) | null = null;
const win = {
  startDragging: vi.fn(async () => undefined),
  isFullscreen: vi.fn(async () => false),
  onResized: vi.fn(async (f: () => void) => { resized = f; return () => { resized = null; }; }),
};
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));
import { startTitleBar } from "./titleBar";

const flush = () => new Promise((r) => setTimeout(r, 0));
const press = (el: Element, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 1, ...init }));
const $ = (s: string) => document.querySelector(s)!;

describe("the Mac title bar", () => {
  let stop = () => undefined as void;
  afterEach(() => {
    stop();
    stop = () => undefined;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("drags from the header line's empty parts, at any click count, never from controls, a right-click or ctrl-click", async () => {
    document.body.innerHTML = `<nav class="rail"><div class="rail__top"><span>gap</span></div></nav>
      <header class="pagehead"><button>Back</button><span role="tab">Data</span><span tabindex="0">tip</span><input /><h1>Home</h1></header><main><p>text</p></main>`;
    stop = startTitleBar();
    expect(document.documentElement.classList.contains("titlebar")).toBe(true);
    for (const s of ["button", "[role='tab']", "[tabindex]", "input", "p"]) press($(s));
    press($("h1"), { button: 2 });
    press($("h1"), { ctrlKey: true });
    await flush();
    expect(win.startDragging).not.toHaveBeenCalled();
    press($("h1"));
    press($("h1"), { detail: 2 });
    press($(".rail__top span"));
    await flush();
    expect(win.startDragging).toHaveBeenCalledTimes(3);
  });

  it("drops the room kept for the window controls in full screen, and cleans up", async () => {
    stop = startTitleBar();
    await flush();
    const root = document.documentElement;
    expect(root.classList.contains("titlebar--full")).toBe(false);
    win.isFullscreen.mockResolvedValueOnce(true);
    resized?.();
    await flush();
    expect(root.classList.contains("titlebar--full")).toBe(true);
    stop();
    stop = () => undefined;
    expect([root.classList.contains("titlebar"), root.classList.contains("titlebar--full"), resized]).toEqual([false, false, null]);
  });
});
