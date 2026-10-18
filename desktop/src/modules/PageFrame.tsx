/**
 * A page the model drew (slice 7): the core serves it with its rows under its own content
 * policy; here it sits in a sandboxed frame (its script, nothing else), gets the app's colours
 * and fonts as the same CSS variables, fresh rows when the world changes, and a line in words
 * when it did not draw. The frame cannot reach the app; the app only posts to it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, PageInfo } from "../core/client";
import { say } from "../core/client";
import { Button, Confirm } from "../ui";

/** The variables the page is told to use (the hand's instruction names the same list). */
export const PAGE_VARS = ["--bg", "--surface", "--surface-2", "--text", "--text-2", "--text-3", "--border", "--line", "--hover", "--primary", "--primary-ink", "--primary-soft", "--good", "--good-soft", "--warn", "--warn-soft", "--bad", "--bad-soft", "--chart-3", "--font-ui", "--font-ed", "--font-mono", "--text-xs", "--text-sm", "--text-md", "--text-base", "--text-lg", "--text-xl", "--text-2xl"];

export function themeVars(): { theme: "light" | "dark"; vars: Record<string, string> } {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const vars: Record<string, string> = {};
  for (const name of PAGE_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  const dark = root.dataset.theme === "dark" || (!root.dataset.theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  return { theme: dark ? "dark" : "light", vars };
}

export function PageFrame({ client, moduleId, page, version, onChanged }: { client: Client; moduleId: string; page: PageInfo; version: number; onChanged: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(page.problem);
  const [ready, setReady] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [height, setHeight] = useState<number | null>(null); // the page's own height, posted by it
  const post = useCallback((message: unknown) => {
    frame.current?.contentWindow?.postMessage(message, "*");
  }, []);
  // a ticket per load: the frame cannot carry the window's token
  useEffect(() => {
    let live = true;
    setReady(false);
    setProblem(page.problem);
    client
      .pageTicket(moduleId, page.name)
      .then((url) => live && setSrc(url))
      .catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, moduleId, page.name, page.updated_at, page.problem]);
  // what the frame says: ready (then it gets the theme), or an error of its own
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow) return;
      const m = (ev.data ?? {}) as { alpha?: string; text?: string };
      if (m.alpha === "ready") {
        post({ alpha: "theme", ...themeVars() });
        setReady(true);
      } else if (m.alpha === "error") {
        setProblem(m.text || "something in its script failed");
      } else if (m.alpha === "size" && typeof (m as { height?: unknown }).height === "number") {
        setHeight(Math.max(120, Math.ceil((m as { height: number }).height)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);
  // the app's theme changed: the page gets the new variables
  useEffect(() => {
    if (!ready) return;
    const send = () => post({ alpha: "theme", ...themeVars() });
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", send);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", send);
    };
  }, [ready, post]);
  // the world changed: fresh rows, without a reload
  const firstVersion = useRef(version);
  useEffect(() => {
    if (!ready || version === firstVersion.current) return;
    let live = true;
    client
      .pageData(moduleId, page.name)
      .then((data) => live && post({ alpha: "data", data }))
      .catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, moduleId, page.name, version, ready, post]);
  const toggleFront = () => void client.setPageFront(moduleId, page.name, !page.front).then(onChanged).catch((e: unknown) => setProblem(say(e)));
  const remove = () => void client.removePage(moduleId, page.name).then(() => { setRemoving(false); onChanged(); }).catch((e: unknown) => setProblem(say(e)));
  return (
    <div className="pageframe">
      <div className="pageframe__head">
        <b>{page.title}</b>
        <span className="faint">{page.front ? "This module's page, drawn by Alpha; ask for what you want on it" : "A page Alpha drew"}{page.data.length ? ` · reads ${page.data.join(", ")}` : ""}</span>
        <div className="section__right">
          <Button size="sm" onClick={toggleFront}>{page.front ? "Make it a tab" : "Show it on Overview"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>Remove…</Button>
        </div>
      </div>
      {problem ? (
        <p className="notice" role="alert">This page did not draw: {problem}</p>
      ) : null}
      {src ? <iframe ref={frame} className="pageframe__frame" title={page.title} src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" style={height ? { height, minHeight: 0, flex: "none" } : undefined} /> : <p className="empty">Opening the page…</p>}
      <Confirm open={removing} title={`Remove the page ${page.title}?`} action="Remove" onConfirm={remove} onCancel={() => setRemoving(false)}>
        <p>Its file goes; the tables it read stay. Alpha can draw it again if you ask.</p>
      </Confirm>
    </div>
  );
}
