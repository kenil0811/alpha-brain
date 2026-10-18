import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, PageInfo } from "../core/client";
import { PAGE_VARS, PageFrame, themeVars } from "./PageFrame";

const page: PageInfo = { name: "summary", module: "m_1", title: "Summary", front: true, data: ["days"], problem: null, updated_at: "2026-10-18T10:00:00+00:00" };

function fakeClient(over: Partial<Record<keyof Client, unknown>> = {}): Client {
  return {
    pageTicket: () => Promise.resolve("http://127.0.0.1:1/api/pages/t1"),
    pageData: () => Promise.resolve({ days: [{ day: "2026-10-12", calories: 2200 }] }),
    setPageFront: () => Promise.resolve(page),
    removePage: () => Promise.resolve({ removed: "summary" }),
    ...over,
  } as unknown as Client;
}

function frameWindow(): { post: ReturnType<typeof vi.fn>; frame: HTMLIFrameElement } {
  const frame = document.querySelector("iframe") as HTMLIFrameElement;
  const post = vi.fn();
  Object.defineProperty(frame, "contentWindow", { value: { postMessage: post }, configurable: true });
  return { post, frame };
}

function fromFrame(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, source: frame.contentWindow as Window }));
  });
}

describe("a page the model drew, in its frame", () => {
  it("loads the page by a one-use ticket in a sandboxed frame and hands it the app's variables when it is ready", async () => {
    document.documentElement.style.setProperty("--primary", "#3f6f99");
    render(<PageFrame client={fakeClient()} moduleId="m_1" page={page} version={1} onChanged={vi.fn()} />);
    const frame = (await screen.findByTitle("Summary")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("src")).toBe("http://127.0.0.1:1/api/pages/t1");
    const { post } = frameWindow();
    fromFrame(frame, { alpha: "ready" });
    expect(post).toHaveBeenCalledTimes(1);
    const sent = post.mock.calls[0][0] as { alpha: string; theme: string; vars: Record<string, string> };
    expect(sent.alpha).toBe("theme");
    expect(sent.vars["--primary"]).toBe("#3f6f99");
    expect(PAGE_VARS).toContain("--font-ui");
    expect(themeVars().theme).toBe("light");
  });

  it("says in words when the page did not draw, and posts fresh rows when the world changed", async () => {
    const onChanged = vi.fn();
    const client = fakeClient();
    const { rerender } = render(<PageFrame client={client} moduleId="m_1" page={page} version={1} onChanged={onChanged} />);
    const frame = (await screen.findByTitle("Summary")) as HTMLIFrameElement;
    const { post } = frameWindow();
    fromFrame(frame, { alpha: "ready" });
    fromFrame(frame, { alpha: "error", text: "days is not defined" });
    expect(screen.getByRole("alert")).toHaveTextContent("This page did not draw: days is not defined");
    rerender(<PageFrame client={client} moduleId="m_1" page={page} version={2} onChanged={onChanged} />);
    await waitFor(() => expect(post).toHaveBeenCalledWith({ alpha: "data", data: { days: [{ day: "2026-10-12", calories: 2200 }] } }, "*"));
    // the page says how tall it is: the frame follows
    fromFrame(frame, { alpha: "size", height: 712 });
    expect(frame.style.height).toBe("712px");
    // a message from anywhere else is ignored
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { alpha: "error", text: "nope" }, source: window }));
    });
    expect(screen.getByRole("alert")).not.toHaveTextContent("nope");
  });

  it("offers the front mark and removal, each through the core", async () => {
    const setPageFront = vi.fn(() => Promise.resolve({ ...page, front: false }));
    const removePage = vi.fn(() => Promise.resolve({ removed: "summary" }));
    const onChanged = vi.fn();
    render(<PageFrame client={fakeClient({ setPageFront, removePage })} moduleId="m_1" page={page} version={1} onChanged={onChanged} />);
    (await screen.findByRole("button", { name: "Make it a tab" })).click();
    await waitFor(() => expect(setPageFront).toHaveBeenCalledWith("m_1", "summary", false));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "Remove…" }).click();
    (await screen.findByRole("button", { name: "Remove" })).click();
    await waitFor(() => expect(removePage).toHaveBeenCalledWith("m_1", "summary"));
  });
});
