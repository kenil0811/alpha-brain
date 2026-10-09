/**
 * The workspace: the sidebar, the page it points at, and the conversation beside it. The window
 * gets its core session from the host (or Vite env in a browser), then everything is one
 * client. Pages reload when the core reports a change that touches them (`core/changes.ts`: one
 * poll, versions per scope, nothing while the window is hidden), and when the person does
 * something here. When the core stops answering the window says so and the host brings it back.
 *
 * The frame is always three parts (the UI rulebook §3): sidebar | main | assistant panel, apart by
 * a soft seam. Each side panel has three widths: normal, wide (dragged, or by the keys on its
 * handle) and folded, a narrow strip that never disappears. Escape steps the panel with the
 * focus back one level (`shell/stepBack.ts`). Widths and folds are remembered here, per window.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Client, moduleWords } from "./core/client";
import { useChanges } from "./core/changes";
import { host } from "./core/host";
import { resolveSession } from "./core/session";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { AgentPage } from "./shell/AgentPage";
import { Home } from "./shell/Home";
import { Intelligence } from "./shell/Intelligence";
import { AutomationPage } from "./shell/AutomationPage";
import { CommandMenu } from "./shell/CommandMenu";
import { SkillPage } from "./shell/SkillPage";
import { EntityPage, Network } from "./shell/Network";
import { Rail, knownSurface, type Surface } from "./shell/Rail";
import { currentHashSurface, pushAddress } from "./shell/address";
import { useDragWidth } from "./shell/useDragWidth";
import { useStepBack } from "./shell/stepBack";
import { ModulePage } from "./modules/ModulePage";
import { RecordPage, type LeaveGuard } from "./modules/RecordPage";
import { ClaudeRow, Settings } from "./shell/Settings";
import { useTheme } from "./shell/theme";
import type { ClaudeStatus, ModuleCard, Thinking } from "./core/client";
import { Button } from "./ui";

const SURFACE_KEY = "alpha.surface";
const PANEL_KEY = "alpha.panel";
const RAIL_KEY = "alpha.rail.collapsed";
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
  // The address wins when it names a page; otherwise the remembered place. Activity is no page:
  // asked for, it opens the sidebar's bell over the page that is open (Home at the start).
  const [start] = useState<Surface>(() => currentHashSurface() ?? knownSurface(remembered<unknown>(SURFACE_KEY, null)));
  const [surface, setSurfaceState] = useState<Surface>(start.kind === "activity" ? { kind: "home" } : start);
  const [activityAt, setActivityAt] = useState(start.kind === "activity" ? Date.now() : 0);
  // `panelOpen` false is the assistant panel folded to its strip, never gone.
  const [panelOpen, setPanelOpen] = useState<boolean>(() => remembered<boolean>(PANEL_KEY, true));
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => remembered<boolean>(RAIL_KEY, false));
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [needs, setNeeds] = useState(0);
  const [restarted, setRestarted] = useState(false);
  // A sentence handed to the panel: put in the composer (an "Ask Alpha…" button), or sent at
  // once (quick entry on a table).
  const [draft, setDraft] = useState<{ text: string; send: boolean } | null>(null);
  const [focusThread, setFocusThread] = useState<{ id: string; at: number } | null>(null);
  const [focusConversation, setFocusConversation] = useState<{ id: string; at: number } | null>(null);
  const [theme, setTheme] = useTheme();
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);
  const [thinking, setThinking] = useState<Thinking | null>(null);

  // A page with unsaved changes (a record's) holds the window's leaving until the person says
  // Save, Discard or Stay: it registers a guard here, and every way out asks it first (9 Oct,
  // the UI rulebook §7).
  const guard = useRef<LeaveGuard | null>(null);
  const onGuard = useCallback((g: LeaveGuard | null) => {
    guard.current = g;
  }, []);
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const commitSurface = useCallback((next: Surface) => {
    const place = knownSurface(next);
    if (place.kind === "activity") {
      setActivityAt(Date.now());
      pushAddress(surfaceRef.current, true); // the address names the page, not the bell
      return;
    }
    setSurfaceState(place);
    remember(SURFACE_KEY, place);
    pushAddress(place);
  }, []);
  const setSurface = useCallback((next: Surface) => {
    if (knownSurface(next).kind === "activity") return commitSurface(next); // the bell leaves the page as it is
    if (guard.current?.(() => commitSurface(next))) return;
    commitSurface(next);
  }, [commitSurface]);
  // Back and forward move between pages; a typed address opens one.
  useEffect(() => {
    const onPop = () => {
      const named = currentHashSurface();
      if (!named) return;
      if (named.kind === "activity") return commitSurface(named);
      if (guard.current?.(() => commitSurface(named))) {
        pushAddress(surfaceRef.current); // Back was held: the address goes back to the page that stays
        return;
      }
      setSurfaceState(named);
      remember(SURFACE_KEY, named);
      pushAddress(named, true); // an old address (`#/people`) shows its new name
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
  // ⌘K (or Ctrl+K) anywhere in the window: search everything. "/" outside a text field: insert
  // (the UI rulebook §15).
  const [commandOpen, setCommandOpen] = useState(false);
  const [inserting, setInserting] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setInserting(false);
        setCommandOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='dialog']")) return;
        e.preventDefault();
        setInserting(true);
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const rail = useDragWidth("alpha.rail.width", { initial: 224, min: 160, max: 360, wide: 288, grow: "right" });
  const panel = useDragWidth("alpha.panel.width", { initial: 380, min: 280, max: 640, wide: 500, grow: "left" });

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
  const moduleOf = useCallback((table: string) => modules.find((m) => m.tables.some((t) => t.name === table))?.id, [modules]);
  const { versions, down, bump, poll } = useChanges(client, moduleOf);
  const changed = bump;

  // The rail's modules and the Home badge, refreshed when something changed.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client
      .home()
      .then((home) => {
        if (cancelled) return;
        setModules(home.modules);
        setNeeds(home.needs_you.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, versions.home]);

  // Whether Alpha can think: checked at start and when the core comes back (Settings checks
  // again while the person signs in).
  useEffect(() => {
    if (!client) return;
    client
      .thinking()
      .then((t) => {
        setThinking(t);
        setClaude(t.claude);
      })
      .catch(() => client.claude().then(setClaude).catch(() => undefined));
  }, [client, versions.all]);
  const chosen = thinking ? thinking[thinking.route] : claude;
  const chosenName = thinking?.route === "codex" ? "ChatGPT" : "Claude";

  // The host says when it started the core again: look at everything afresh and say so.
  useEffect(() => {
    let stop: (() => void) | null = null;
    void host.onEvent("core-restarted", () => {
      setRestarted(true);
      void poll();
      bump();
    }).then((off) => {
      stop = off;
    });
    return () => stop?.();
  }, [bump, poll]);
  useEffect(() => {
    if (!restarted) return;
    const timer = setTimeout(() => setRestarted(false), 8000);
    return () => clearTimeout(timer);
  }, [restarted]);

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
  const foldRail = (folded: boolean) => {
    setRailCollapsed(folded);
    remember(RAIL_KEY, folded);
  };
  useStepBack(
    { folded: railCollapsed, wide: rail.wide, narrow: rail.narrow, fold: () => foldRail(true) },
    { folded: !panelOpen, wide: panel.wide, narrow: panel.narrow, fold: () => togglePanel(false) },
  );
  const startNew = () => {
    setDraft({ text: "I want to ", send: false });
    togglePanel(true);
  };

  // a record's page is inside its module: the assistant works in that module's scope there too
  const scopeId = surface.kind === "module" ? surface.id : surface.kind === "record" ? surface.module : null;
  const scopeModule = scopeId ? (modules.find((m) => m.id === scopeId) ?? null) : null;
  const scopeName =
    surface.kind === "module" || surface.kind === "record" ? (scopeModule ? moduleWords(scopeModule) : "Module") : surface.kind === "home" ? "Home" : surface.kind === "settings" ? "Settings" : surface.kind === "people" || surface.kind === "entity" ? "Network" : "Intelligence";

  return (
    <div
      className={`app${panelOpen ? "" : " app--assistant-folded"}${railCollapsed ? " app--rail-collapsed" : ""}${rail.active || panel.active ? " app--resizing" : ""}`}
      style={{ ["--rail-w" as string]: railCollapsed ? undefined : `${rail.width}px`, ["--panel-w" as string]: panelOpen ? `${panel.width}px` : undefined }}
    >
      <Rail client={client} surface={surface} modules={modules} needs={needs} onGo={setSurface} onNew={startNew} collapsed={railCollapsed} onToggleCollapsed={() => foldRail(!railCollapsed)} onChanged={changed} openActivity={activityAt} activityVersion={versions.intelligence} />
      {!railCollapsed ? <Resizer side="rail" label="Resize the sidebar" drag={rail} /> : null}
      {panelOpen && client ? <Resizer side="panel" label="Resize the assistant panel" drag={panel} /> : null}
      <main className="main">
        {down ? (
          <div className="corenote" role="alert">
            <span>Alpha's core isn't answering ({down}). The host starts it again on its own; this clears when it is back.</span>
            <Button size="sm" onClick={() => void poll()}>
              Try now
            </Button>
          </div>
        ) : restarted ? (
          <div className="corenote corenote--ok" role="status">
            Alpha's core started again. Anything that was running is open to ask again.
          </div>
        ) : null}
        {runtime.kind === "connected" && chosen && !chosen.signed_in && surface.kind !== "settings" ? (
          <div className="page firstrun">
            <div className="card firstrun__card">
              <div className="firstrun__head">
                <h2>Connect {chosenName} to start</h2>
                <span className="muted">Alpha thinks with your {chosenName} account. It takes a minute, once. Settings has the other way too.</span>
              </div>
              <div className="list">
                <ClaudeRow which={thinking?.route ?? "claude"} client={runtime.client} status={chosen} onStatus={(s) => { if (thinking?.route === "codex") setThinking((t) => (t ? { ...t, codex: s } : t)); else { setClaude(s); setThinking((t) => (t ? { ...t, claude: s } : t)); } }} />
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
                <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
              </p>
            ) : null}
          </div>
        ) : surface.kind === "home" ? (
          <Home client={runtime.client} version={versions.home} onGo={setSurface} onChanged={changed} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} onNew={startNew} onOpenThread={(id) => { setFocusThread({ id, at: Date.now() }); togglePanel(true); }} />
        ) : surface.kind === "module" ? (
          <ModulePage key={surface.id} client={runtime.client} moduleId={surface.id} version={(versions.modules[surface.id] ?? 0) + versions.all} onChanged={changed} onGo={setSurface} onSay={(text) => { setDraft({ text, send: true }); togglePanel(true); }} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} onOpenRecord={(table, id) => setSurface({ kind: "record", module: surface.id, table, id })} modules={modules} />
        ) : surface.kind === "record" ? (
          <RecordPage key={`${surface.table}/${surface.id}`} client={runtime.client} module={surface.module} table={surface.table} id={surface.id} version={(versions.modules[surface.module] ?? 0) + versions.all} modules={modules} onGo={setSurface} onChanged={changed} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} onGuard={onGuard} />
        ) : surface.kind === "settings" ? (
          <Settings client={runtime.client} theme={theme} onTheme={setTheme} claude={claude} onClaude={setClaude} thinking={thinking} onThinking={setThinking} onChanged={changed} />
        ) : surface.kind === "people" ? (
          <Network client={runtime.client} version={versions.people} onOpen={(id) => setSurface({ kind: "entity", id })} />
        ) : surface.kind === "entity" ? (
          <EntityPage key={surface.id} client={runtime.client} id={surface.id} version={versions.people} onBack={() => setSurface({ kind: "people" })} onOpen={(id) => setSurface({ kind: "entity", id })} onChanged={changed} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} />
        ) : surface.kind === "skill" ? (
          <SkillPage key={surface.name} client={runtime.client} name={surface.name} version={versions.intelligence} onGo={setSurface} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} onChanged={changed} />
        ) : surface.kind === "automation" ? (
          <AutomationPage key={surface.id} client={runtime.client} id={surface.id} version={versions.intelligence} onGo={setSurface} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} onChanged={changed} />
        ) : surface.kind === "agent" ? (
          <AgentPage key={surface.id} client={runtime.client} id={surface.id} version={versions.intelligence} onGo={setSurface} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} onChanged={changed} />
        ) : surface.kind === "intelligence" ? (
          <Intelligence client={runtime.client} tab={surface.tab ?? "second-brain"} version={versions.intelligence} onTab={(tab) => setSurface({ kind: "intelligence", tab })} onChanged={changed} onGo={setSurface} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} />
        ) : null}
      </main>
      {client ? <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} insert={inserting} surface={surface} onNewModule={startNew} client={client} modules={modules} onGo={setSurface} onAsk={(text) => { setDraft({ text, send: false }); togglePanel(true); }} /> : null}
      {client ? (
        <AssistantPanel client={client} open={panelOpen} onOpen={togglePanel} scopeName={scopeName} module={scopeModule} version={versions.conversation} onChanged={changed} draft={draft} onDraftTaken={() => setDraft(null)} focusThread={focusThread} focusConversation={focusConversation} />
      ) : null}
    </div>
  );
}

/** The handle on a side panel's inner edge: shown on hover and on keyboard focus, drawn by the
 *  pointer, the arrow keys (Home and End for the ends) or a double-click (normal ↔ wide). */
function Resizer({ side, label, drag }: { side: "rail" | "panel"; label: string; drag: ReturnType<typeof useDragWidth> }) {
  return (
    <div
      className={`resizer resizer--${side}${drag.active ? " resizer--active" : ""}`}
      data-panel={side}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={drag.width}
      aria-valuemin={drag.bounds.min}
      aria-valuemax={drag.bounds.max}
      tabIndex={0}
      onPointerDown={drag.onPointerDown}
      onKeyDown={drag.onKeyDown}
      onDoubleClick={drag.onDoubleClick}
    />
  );
}
