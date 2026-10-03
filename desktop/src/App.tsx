/**
 * The workspace: the rail, the page it points at, and the conversation beside it. The window
 * gets its core session from the host (or Vite env in a browser), then everything is one
 * client. Pages reload when the core reports a change (a turn finished, a row was edited).
 */
import { useCallback, useEffect, useState } from "react";
import { Client } from "./core/client";
import { resolveSession } from "./core/session";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { Activity } from "./shell/Activity";
import { Home } from "./shell/Home";
import { Intelligence, type IntelTab } from "./shell/Intelligence";
import { EntityPage, People } from "./shell/People";
import { Rail, knownSurface, type Surface } from "./shell/Rail";
import { currentHashSurface, pushAddress } from "./shell/address";
import { useDragWidth } from "./shell/useDragWidth";
import { ModulePage } from "./modules/ModulePage";
import { ClaudeRow, Settings } from "./shell/Settings";
import { useTheme } from "./shell/theme";
import type { ClaudeStatus, ModuleCard } from "./core/client";

const SURFACE_KEY = "alpha.surface";
const PANEL_KEY = "alpha.panel";
export const HANDOFF_KEY = "alpha.handoff";

function remembered<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* per-window convenience only */
  }
}

type Runtime = { kind: "connecting" } | { kind: "connected"; client: Client } | { kind: "unavailable"; reason: string };

export function App({ client: injected }: { client?: Client } = {}) {
  const [runtime, setRuntime] = useState<Runtime>(injected ? { kind: "connected", client: injected } : { kind: "connecting" });
  const [attempt, setAttempt] = useState(0);
  // The address wins when it names a page; otherwise the remembered place.
  const [surface, setSurfaceState] = useState<Surface>(() => currentHashSurface() ?? knownSurface(remembered<unknown>(SURFACE_KEY, null)));
  const [panelOpen, setPanelOpen] = useState<boolean>(() => remembered<boolean>(PANEL_KEY, true));
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => remembered<boolean>("alpha.rail.collapsed", false));
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [needs, setNeeds] = useState(0);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [focusThread, setFocusThread] = useState<{ id: string; at: number } | null>(null);
  const [focusConversation, setFocusConversation] = useState<{ id: string; at: number } | null>(null);
  const [theme, setTheme] = useTheme();
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);

  const setSurface = useCallback((next: Surface) => {
    setSurfaceState(next);
    remember(SURFACE_KEY, next);
    pushAddress(next);
  }, []);
  // Back and forward move between pages; a typed address opens one.
  useEffect(() => {
    const onPop = () => {
      const named = currentHashSurface();
      if (named) {
        setSurfaceState(named);
        remember(SURFACE_KEY, named);
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    pushAddress(surface);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
    // once: the listeners read the address, not this render's surface
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rail = useDragWidth("alpha.rail.width", 224, 160, 360, "right");
  const panel = useDragWidth("alpha.panel.width", 380, 280, 560, "left");
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (injected) return;
    let cancelled = false;
    void resolveSession().then(async (resolution) => {
      if (cancelled) return;
      if (resolution.kind === "unavailable") {
        setRuntime({ kind: "unavailable", reason: resolution.reason });
        return;
      }
      const client = new Client(resolution.session);
      try {
        await client.health();
        if (!cancelled) setRuntime({ kind: "connected", client });
      } catch (e) {
        if (!cancelled) setRuntime({ kind: "unavailable", reason: e instanceof Error ? e.message : String(e) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [injected, attempt]);
  useEffect(() => {
    if (runtime.kind !== "unavailable" || injected) return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), 4000);
    return () => clearTimeout(timer);
  }, [runtime, injected]);

  const client = runtime.kind === "connected" ? runtime.client : null;

  // The rail's modules and the Home badge, refreshed on every change and every 20 s (the core
  // may have done something on its own: a folder changed, a calendar sync).
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const load = () =>
      client
        .home()
        .then((home) => {
          if (cancelled) return;
          setModules(home.modules);
          setNeeds(home.needs_you.length);
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, version]);

  // Whether Alpha can think: checked at start and every minute (the person may sign Claude
  // Code in or out elsewhere).
  useEffect(() => {
    if (!client) return;
    const check = () => client.claude().then(setClaude).catch(() => undefined);
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [client]);

  // The companion hands things over through shared storage: open a module, the conversation.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HANDOFF_KEY || !event.newValue) return;
      try {
        const handoff = JSON.parse(event.newValue) as { surface?: Surface; panel?: boolean; conversation?: string };
        if (handoff.surface) setSurface(knownSurface(handoff.surface));
        if (handoff.panel) setPanelOpen(true);
        if (handoff.conversation) setFocusConversation({ id: handoff.conversation, at: Date.now() });
        changed();
      } catch {
        /* not a handoff */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setSurface, changed]);

  const togglePanel = (open: boolean) => {
    setPanelOpen(open);
    remember(PANEL_KEY, open);
  };
  const toggleRail = () =>
    setRailCollapsed((c) => {
      remember("alpha.rail.collapsed", !c);
      return !c;
    });
  const startNew = () => {
    setDraft("I want to ");
    togglePanel(true);
  };

  const scopeModule = surface.kind === "module" ? (modules.find((m) => m.id === surface.id) ?? null) : null;
  const scopeName =
    surface.kind === "module" ? (scopeModule?.name ?? "Module") : surface.kind === "home" ? "Home" : surface.kind === "activity" ? "Activity" : surface.kind === "settings" ? "Settings" : surface.kind === "people" || surface.kind === "entity" ? "People & Companies" : "Intelligence";

  return (
    <div
      className={`app${panelOpen ? "" : " app--assistant-hidden"}${railCollapsed ? " app--rail-collapsed" : ""}${rail.active || panel.active ? " app--resizing" : ""}`}
      style={{ ["--rail-w" as string]: railCollapsed ? undefined : `${rail.width}px`, ["--panel-w" as string]: `${panel.width}px` }}
    >
      <Rail surface={surface} modules={modules} needs={needs} runtime={runtime.kind} onGo={setSurface} onNew={startNew} collapsed={railCollapsed} onToggleCollapsed={toggleRail} />
      {!railCollapsed ? <div className={`resizer resizer--rail${rail.active ? " resizer--active" : ""}`} onPointerDown={rail.onPointerDown} role="separator" aria-orientation="vertical" aria-label="Resize the sidebar" /> : null}
      {panelOpen && client ? <div className={`resizer resizer--panel${panel.active ? " resizer--active" : ""}`} onPointerDown={panel.onPointerDown} role="separator" aria-orientation="vertical" aria-label="Resize the conversation panel" /> : null}
      <main className="main">
        {!panelOpen && runtime.kind === "connected" ? (
          <button type="button" className="btn btn--primary assist__reopen" onClick={() => togglePanel(true)}>
            Ask Alpha
          </button>
        ) : null}
        {runtime.kind === "connected" && claude && !claude.signed_in && surface.kind !== "settings" ? (
          <div className="page firstrun">
            <div className="card firstrun__card">
              <div className="firstrun__head">
                <h2>Connect Claude to start</h2>
                <span className="muted">Alpha thinks with your Claude account. It takes a minute, once.</span>
              </div>
              <div className="list">
                <ClaudeRow client={runtime.client} status={claude} onStatus={setClaude} />
              </div>
            </div>
          </div>
        ) : null}
        {runtime.kind !== "connected" ? (
          <div className="page">
            <h1>{runtime.kind === "connecting" ? "Starting Alpha…" : "Alpha's core isn't running"}</h1>
            {runtime.kind === "connecting" ? (
              <p className="muted" style={{ marginTop: 8 }}>
                This takes a second or two. If macOS is asking whether Alpha may access a folder, allow it and Alpha carries on.
              </p>
            ) : null}
            {runtime.kind === "unavailable" ? (
              <p className="muted" style={{ marginTop: 8 }}>
                {runtime.reason}{" "}
                <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              </p>
            ) : null}
          </div>
        ) : surface.kind === "home" ? (
          <Home client={runtime.client} version={version} onGo={setSurface} onChanged={changed} onAsk={(text) => { setDraft(text); togglePanel(true); }} onNew={startNew} onOpenThread={(id) => { setFocusThread({ id, at: Date.now() }); togglePanel(true); }} />
        ) : surface.kind === "module" ? (
          <ModulePage key={surface.id} client={runtime.client} moduleId={surface.id} version={version} onChanged={changed} onGo={setSurface} />
        ) : surface.kind === "settings" ? (
          <Settings client={runtime.client} theme={theme} onTheme={setTheme} claude={claude} onClaude={setClaude} />
        ) : surface.kind === "people" ? (
          <People client={runtime.client} version={version} onOpen={(id) => setSurface({ kind: "entity", id })} />
        ) : surface.kind === "entity" ? (
          <EntityPage key={surface.id} client={runtime.client} id={surface.id} version={version} onBack={() => setSurface({ kind: "people" })} onOpen={(id) => setSurface({ kind: "entity", id })} onChanged={changed} />
        ) : surface.kind === "intelligence" ? (
          <Intelligence client={runtime.client} tab={(surface.tab ?? "skills") as IntelTab} version={version} onTab={(tab) => setSurface({ kind: "intelligence", tab })} onChanged={changed} />
        ) : (
          <Activity client={runtime.client} version={version} onChanged={changed} />
        )}
      </main>
      {client ? (
        <AssistantPanel client={client} open={panelOpen} onOpen={togglePanel} scopeName={scopeName} module={scopeModule} version={version} onChanged={changed} draft={draft} onDraftTaken={() => setDraft(null)} focusThread={focusThread} focusConversation={focusConversation} />
      ) : null}
    </div>
  );
}
