/**
 * The workspace: the rail, the page it points at, and the conversation beside it. The window
 * gets its core session from the host (or Vite env in a browser), then everything is one
 * client. Pages reload when the core reports a change (a turn finished, a row was edited).
 *
 * The rail and the conversation are side panels that collapse, expand and resize
 * (ui/panel); neither ever covers the page at full width. Below 1024px the rail shows icons
 * and the conversation opens over the page, without changing what was saved. The page lives
 * in the address (`#/m/<id>`), so back and forward work.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Client } from "./core/client";
import { resolveSession } from "./core/session";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { Activity } from "./shell/Activity";
import { CommandMenu } from "./shell/CommandMenu";
import { Home } from "./shell/Home";
import { Intelligence, type IntelTab } from "./shell/Intelligence";
import { Rail, knownSurface, surfaceFromPath, surfacePath, type Surface } from "./shell/Rail";
import { ModulePage } from "./modules/ModulePage";
import { ClaudeRow, Settings } from "./shell/Settings";
import { useTheme } from "./shell/theme";
import { InfoTip, PageHeader, ResizeHandle, ToastProvider, TooltipProvider, usePanelControl } from "./ui";
import { ZazooIcon } from "./ui/ZazooIcon";
import type { ClaudeStatus, ModuleCard } from "./core/client";

const SURFACE_KEY = "alpha.surface";
export const HANDOFF_KEY = "alpha.handoff";
const COMPACT_BELOW = 1024;

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
  return (
    <TooltipProvider>
      <ToastProvider>
        <Workspace injected={injected} />
      </ToastProvider>
    </TooltipProvider>
  );
}

function Workspace({ injected }: { injected?: Client }) {
  const [runtime, setRuntime] = useState<Runtime>(injected ? { kind: "connected", client: injected } : { kind: "connecting" });
  const [attempt, setAttempt] = useState(0);
  const [surface, setSurfaceState] = useState<Surface>(() => surfaceFromPath(window.location.hash) ?? knownSurface(remembered<unknown>(SURFACE_KEY, null)));
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [needs, setNeeds] = useState(0);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [railPeek, setRailPeek] = useState(false);
  const [assistPeek, setAssistPeek] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const assistRef = useRef<HTMLDivElement>(null);

  const railPanel = usePanelControl({ defaultWidth: 224, minWidth: 76, maxWidth: 360, storageKeyWidth: "alpha.rail.width", storageKeyCollapsed: "alpha.rail.collapsed", snap: true, snapMidpoint: 150 });
  const assistantPanel = usePanelControl({ defaultWidth: 380, minWidth: 260, maxWidth: 520, storageKeyWidth: "alpha.assistant.width", storageKeyCollapsed: "alpha.assistant.collapsed" });
  const compact = viewport < COMPACT_BELOW;
  const assistOpen = compact ? assistPeek : !assistantPanel.collapsed;

  const setSurface = useCallback((next: Surface) => {
    setSurfaceState(next);
    remember(SURFACE_KEY, next);
    const path = `#${surfacePath(next)}`;
    if (window.location.hash !== path) window.history.pushState(null, "", path);
  }, []);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const openAssistant = useCallback(() => {
    if (compact) setAssistPeek(true);
    else assistantPanel.setCollapsed(false);
  }, [compact, assistantPanel]);
  const closeAssistant = () => (compact ? setAssistPeek(false) : assistantPanel.setCollapsed(true));

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    const onPop = () => setSurfaceState(surfaceFromPath(window.location.hash) ?? { kind: "home" });
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Escape steps the panel that has focus down one level (unless a menu or dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const active = document.activeElement;
      if (railRef.current?.contains(active)) railPanel.handleEscape();
      else if (assistRef.current?.contains(active)) {
        if (compact) setAssistPeek(false);
        else assistantPanel.handleEscape();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [railPanel, assistantPanel, compact]);

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

  // The rail's projects and the Home badge, refreshed on every change and every 20 s (the core
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

  // The companion hands things over through shared storage: open a project, the conversation.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HANDOFF_KEY || !event.newValue) return;
      try {
        const handoff = JSON.parse(event.newValue) as { surface?: Surface; panel?: boolean };
        if (handoff.surface) setSurface(knownSurface(handoff.surface));
        if (handoff.panel) openAssistant();
        changed();
      } catch {
        /* not a handoff */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setSurface, changed, openAssistant]);

  const ask = useCallback(
    (text: string) => {
      setDraft(text);
      openAssistant();
    },
    [openAssistant],
  );
  const startNew = useCallback(() => ask("I want to "), [ask]);

  const scopeModule = surface.kind === "module" ? (modules.find((m) => m.id === surface.id) ?? null) : null;
  const scopeName =
    surface.kind === "module" ? (scopeModule?.name ?? "Project") : surface.kind === "home" ? "Home" : surface.kind === "activity" ? "Activity" : surface.kind === "settings" ? "Settings" : "Intelligence";

  const railWidth = railPanel.collapsed ? 76 : railPanel.displayWidth;
  const assistantWidth = assistantPanel.displayWidth;

  return (
    <div className="app">
      <div ref={railRef} className="app__rail">
        <Rail
          surface={surface}
          modules={modules}
          needs={needs}
          runtime={runtime.kind}
          onGo={setSurface}
          onNew={startNew}
          client={client}
          onChanged={changed}
          panel={compact ? { ...railPanel, collapsed: !railPeek, displayWidth: railPeek ? railPanel.width : 76, toggleCollapsed: () => setRailPeek((v) => !v) } : { ...railPanel, displayWidth: railWidth }}
        />
      </div>
      <main className="main">
        {runtime.kind !== "connected" ? (
          <div className="page">
            <PageHeader title={runtime.kind === "connecting" ? "Starting Alpha…" : "Alpha's core isn't running"} />
            {runtime.kind === "unavailable" ? (
              <p className="notice page__line" role="alert">
                {runtime.reason}{" "}
                <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {claude && !claude.signed_in && surface.kind !== "settings" ? (
              <div className="page firstrun">
                <div className="card firstrun__card">
                  <div className="firstrun__head">
                    <h2>
                      Connect Claude to start
                      <InfoTip content="Alpha thinks with your Claude account. It takes a minute, once." label="About connecting Claude" />
                    </h2>
                  </div>
                  <div className="list">
                    <ClaudeRow client={runtime.client} status={claude} onStatus={setClaude} />
                  </div>
                </div>
              </div>
            ) : null}
            {surface.kind === "home" ? (
              <Home client={runtime.client} version={version} onGo={setSurface} onChanged={changed} onAsk={ask} onNew={startNew} />
            ) : surface.kind === "module" ? (
              <ModulePage key={surface.id} client={runtime.client} moduleId={surface.id} version={version} onChanged={changed} onGo={setSurface} />
            ) : surface.kind === "settings" ? (
              <Settings client={runtime.client} theme={theme} onTheme={setTheme} claude={claude} onClaude={setClaude} />
            ) : surface.kind === "intelligence" ? (
              <Intelligence client={runtime.client} modules={modules} tab={(surface.tab ?? "brain") as IntelTab} version={version} onTab={(tab) => setSurface({ kind: "intelligence", tab })} onGo={setSurface} onChanged={changed} />
            ) : (
              <Activity client={runtime.client} version={version} onChanged={changed} />
            )}
          </>
        )}
      </main>
      {client && assistOpen ? (
        <div ref={assistRef} id="panel-right" className="assist" style={compact ? undefined : { width: assistantWidth }}>
          {!compact ? <ResizeHandle side="right" onMouseDown={assistantPanel.startDrag} onStep={assistantPanel.resizeBy} label="Resize Chief of Staff" value={assistantWidth} min={260} max={520} isDragging={assistantPanel.isDragging} /> : null}
          <AssistantPanel client={client} onCollapse={closeAssistant} scopeName={scopeName} module={scopeModule} version={version} onChanged={changed} draft={draft} onDraftTaken={() => setDraft(null)} />
        </div>
      ) : client ? (
        <div className="assist assist--collapsed" style={{ width: 48 }}>
          <button type="button" className="assist__open" onClick={openAssistant} aria-label="Open Chief of Staff" title="Chief of Staff">
            <ZazooIcon size={30} label="" />
          </button>
        </div>
      ) : null}
      {client ? <CommandMenu modules={modules} onGo={setSurface} onNew={startNew} onAsk={ask} /> : null}
    </div>
  );
}
