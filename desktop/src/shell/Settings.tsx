/**
 * Settings: only what a person decides. How Alpha thinks (their Claude, through Claude Code on
 * this Mac), the companion and how the app looks, where their world is kept and copies of it,
 * and the defaults set elsewhere in the app. Each row says what is so and offers the one thing
 * to do about it. Since 13 Oct (Q42 section 6) each part is a card, in two stacks side by side
 * when the page is wide and one under the other when it isn't: Workspace, Thinks with, Reads with, Appearance, Your data, Removed modules (empty until
 * the core keeps removed modules; Kenil: "add in the ui for it now, but keep it empty"),
 * Defaults, Help.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LookPicker } from "../avatar/LookPicker";
import type { ClaudeStatus, Client, DataInfo, ThinkRoute, Thinking, BrowserStatus } from "../core/client";
import { host } from "../core/host";
import { PREF, usePreference } from "../core/preferences";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { ThemeControl, type Theme } from "./theme";
import { Button, Trouble } from "../ui";

const WAIT_EVERY_MS = 3000;

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function readPageSize(): PageSize {
  try {
    const raw = localStorage.getItem(PAGE_SIZE_KEY);
    return raw ? (JSON.parse(raw) as PageSize) : "fit";
  } catch {
    return "fit";
  }
}

/** One way to think, connected or not, and the one step that gets there: Claude through Claude
 *  Code, or ChatGPT through the Codex CLI (Q32). Also used on first run for the chosen one. */
export function ThinkerRow({ which, client, status, onStatus, inUse, onUse }: { which: ThinkRoute; client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; inUse?: boolean; onUse?: () => Promise<unknown> }) {
  const [waiting, setWaiting] = useState<"install" | "signin" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);
  const name = which === "claude" ? "Claude" : "ChatGPT";
  // Use this runs one real tool call through the new way first; a way that cannot reach
  // Alpha's tools is never switched to, and the reason shows here.
  async function use() {
    if (!onUse) return;
    setTrying(true);
    setError(null);
    try {
      await onUse();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrying(false);
    }
  }
  const tool = which === "claude" ? "Claude Code" : "the Codex CLI";
  const calls = which === "claude"
    ? { status: () => client.claude(), install: () => client.installClaude(), signIn: () => client.signInClaude(), signOut: () => client.signOutClaude() }
    : { status: () => client.thinking().then((t) => t.codex), install: () => client.installCodex(), signIn: () => client.signInCodex(), signOut: () => client.signOutCodex() };

  // While the installer runs or the person signs in in their browser, check until it's done.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      calls
        .status()
        .then((s) => {
          onStatus(s);
          if ((waiting === "install" && s.installed) || (waiting === "signin" && s.signed_in)) setWaiting(null);
        })
        .catch(() => undefined);
    }, WAIT_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, client, onStatus, which]);

  async function act(work: () => Promise<unknown>, next: "install" | "signin" | null) {
    setError(null);
    try {
      await work();
      setWaiting(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const connected = Boolean(status?.signed_in);
  const words = !status
    ? "Checking…"
    : confirming
      ? `Alpha can't think with ${name} until you sign in again.`
      : waiting === "install"
        ? which === "claude"
          ? "Installing Claude Code… this takes a minute."
          : "The Codex app's page is open; install it, then come back."
        : waiting === "signin"
          ? "Finish signing in in your browser."
          : connected
            ? [status.email, status.plan ? `${status.plan} plan` : null, status.via === "api_key" ? "with an API key" : null, `through ${tool} on this Mac`].filter(Boolean).join(" · ")
            : status.installed
              ? `Sign in with your ${name} account; your browser opens.`
              : which === "claude"
                ? "Alpha thinks with Claude Code. Installing it takes a minute and needs no password."
                : "Alpha can also think with ChatGPT through the Codex CLI, which the Codex app brings.";
  return (
    <div className="item">
      <div className="item__ico" aria-hidden="true">
        {which === "claude" ? "✳" : "◎"}
      </div>
      <div className="item__body">
        <b>{name}</b>
        <div className={`item__sub${confirming ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? <div className="notice" style={{ fontSize: "var(--text-sm)" }}>{error}</div> : null}
      </div>
      {inUse ? <span className="pill pill--good">In use</span> : onUse && connected ? (
        <Button size="sm" disabled={trying} onClick={() => void use()}>
          {trying ? "Trying it…" : "Use this"}
        </Button>
      ) : null}
      {status ? <span className={`pill ${connected ? "pill--good" : "pill--warn"}`}>{connected ? "Connected" : "Not connected"}</span> : null}
      {!status ? null : connected ? (
        confirming ? (
          <>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" onClick={() => void act(() => calls.signOut().then(onStatus), null).then(() => setConfirming(false))}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Sign out
          </Button>
        )
      ) : status.installed ? (
        <Button size="sm" variant="primary" disabled={waiting !== null} onClick={() => void act(() => calls.signIn(), "signin")}>
          {waiting === "signin" ? "Waiting…" : "Sign in"}
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={waiting !== null} onClick={() => void act(() => calls.install(), "install")}>
          {waiting === "install" ? "Installing…" : "Install"}
        </Button>
      )}
    </div>
  );
}

/** Alpha's own browser, with which it reads web pages: installed once, by Alpha, on first run;
 *  about 250 MB comes down. Sign-in windows open in the person's Chrome when they have it. */
export function BrowserRow({ client, status, onStatus }: { client: Client; status: BrowserStatus | null; onStatus: (s: BrowserStatus) => void }) {
  const [error, setError] = useState<string | null>(null);
  const installing = Boolean(status?.installing);
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(() => {
      client.browser().then(onStatus).catch(() => undefined);
    }, WAIT_EVERY_MS);
    return () => clearInterval(timer);
  }, [installing, client, onStatus]);
  async function install() {
    setError(null);
    try {
      onStatus(await client.installBrowser());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const words = !status
    ? "Checking…"
    : status.installing
      ? (status.words ?? "Installing… this takes a few minutes.")
      : status.installed
        ? `Installed · sign-in windows open in ${status.chrome ? "your Chrome" : "Alpha's own browser"}`
        : (status.problem ?? "Alpha reads web pages with its own browser (Chromium). Installing it downloads about 250 MB, once.");
  return (
    <div className="item">
      <div className="item__ico" aria-hidden="true">
        ◫
      </div>
      <div className="item__body">
        <b>The browser Alpha reads with</b>
        <div className={`item__sub${status?.problem ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? <div className="notice" style={{ fontSize: "var(--text-sm)" }}>{error}</div> : null}
      </div>
      {status ? <span className={`pill ${status.installed ? "pill--good" : "pill--warn"}`}>{status.installed ? "Installed" : "Not installed"}</span> : null}
      {status && !status.installed ? (
        <Button size="sm" variant="primary" disabled={installing} onClick={() => void install()}>
          {installing ? "Installing…" : status.problem ? "Try again" : "Install"}
        </Button>
      ) : null}
    </div>
  );
}

/** The chosen way to think, for the first run. */
export function ClaudeRow({ client, status, onStatus, which = "claude" }: { client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; which?: ThinkRoute }) {
  return <ThinkerRow which={which} client={client} status={status} onStatus={onStatus} />;
}

/** One card of Settings: its title and what it is about inside it, then its rows (13 Oct, Q42
 *  section 6; the cards are pull request #5's idea, the look main's own). */
function SetCard({ id, title, about, children }: { id?: string; title: string; about: string; children: ReactNode }) {
  const head = `setcard-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section id={id} className="card setcard" aria-labelledby={head}>
      <div className="setcard__head">
        <h2 id={head}>{title}</h2>
        <div className="faint">{about}</div>
      </div>
      <div className="list">{children}</div>
    </section>
  );
}

/** The workspace's name, the same one the sidebar shows and renames (section 5). */
function WorkspaceCard({ client }: { client: Client }) {
  const [workspace, setWorkspace] = usePreference<string | null>(client, PREF.workspaceName, null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = typeof workspace === "string" && workspace.trim() ? workspace.trim() : "Alpha";
  const save = async () => {
    const clean = draft.trim();
    const err = await setWorkspace(clean && clean !== "Alpha" ? clean : null);
    setError(err ? `Couldn't rename it: ${err}` : null);
    if (!err) setEditing(false);
  };
  return (
    <SetCard title="Workspace" about="Your world in Alpha, kept on this Mac">
      <div className="item">
        <div className="item__body">
          <b>Name</b>
          {editing ? null : <div className="item__sub">{name}</div>}
          {error ? <div className="item__sub item__sub--warn" role="alert">{error}</div> : null}
        </div>
        {editing ? (
          <>
            <input
              className="textfield"
              aria-label="The workspace's name"
              placeholder="Alpha"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <Button size="sm" variant="primary" onClick={() => void save()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => { setDraft(name === "Alpha" ? "" : name); setEditing(true); }}>
            Edit
          </Button>
        )}
      </div>
      <div className="item">
        <div className="item__body">
          <b>Where it lives</b>
          <div className="item__sub">On this Mac, nowhere else</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => document.getElementById("your-data")?.scrollIntoView({ block: "start", behavior: "smooth" })}>
          Your data
        </Button>
      </div>
    </SetCard>
  );
}

/** The keys the app answers to, each checked in the code that handles it. */
export const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "⌘K", does: "Search everything, from anywhere" },
  { keys: "Enter", does: "Send what you wrote to Alpha" },
  { keys: "Shift+Enter", does: "A new line in what you are writing" },
  { keys: "Escape", does: "Close or cancel" },
  { keys: "Enter or F2", does: "Edit the table cell you are on (or double-click it)" },
  { keys: "⌘V", does: "Paste a block from a spreadsheet into a table" },
  { keys: "Shift+F10", does: "A module's menu in the sidebar (or right-click it)" },
  { keys: "Alt+arrows", does: "Move a module in the sidebar: up, down, inside, out" },
];

function HelpCard() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!host.available()) return;
    // the Mac app knows its version; a browser tab has none and says Unknown
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setVersion)
      .catch(() => undefined);
  }, []);
  return (
    <SetCard title="Help" about="The keys Alpha answers to">
      <dl className="setkeys">
        {SHORTCUTS.map((k) => (
          <div key={k.keys}>
            <dt>
              <kbd className="kbd">{k.keys}</kbd>
            </dt>
            <dd>{k.does}</dd>
          </div>
        ))}
      </dl>
      <div className="item">
        <div className="item__body">
          <b>Version</b>
          <div className="item__sub">{version ?? "Unknown"}</div>
        </div>
      </div>
    </SetCard>
  );
}

export function Settings({ client, theme, onTheme, claude, onClaude, thinking, onThinking }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; thinking?: Thinking | null; onThinking?: (t: Thinking) => void }) {
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [data, setData] = useState<DataInfo | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const [busy, setBusy] = useState(false);

  const [trouble, setTrouble] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [browser, setBrowser] = useState<BrowserStatus | null>(null);
  useEffect(() => {
    void client.browser().then(setBrowser).catch(() => undefined);
  }, [client, tick]);
  useEffect(() => {
    void host.companionVisible().then(setCompanion).catch(() => setCompanion(null));
    client
      .dataInfo()
      .then((d) => {
        setData(d);
        setTrouble(null);
      })
      .catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e)));
    client.claude().then(onClaude).catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e)));
  }, [client, onClaude, tick]);

  const choosePageSize = useCallback((next: PageSize) => {
    setPageSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, JSON.stringify(next));
    } catch {
      /* the choice lasts this session */
    }
  }, []);

  const last = data?.backups[0];
  return (
    <div className="page">
      {trouble ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Settings: {trouble}</Trouble> : null}
      <div className="home__head">
        <h1>Settings</h1>
        <span className="muted">How Alpha thinks, looks and keeps your data</span>
      </div>

      <div className="setcards">
        <div className="setcards__col">
          <WorkspaceCard client={client} />

          <SetCard title="Thinks with" about="Claude through Claude Code, or ChatGPT through the Codex CLI; each on your own subscription">
            <ThinkerRow which="claude" client={client} status={thinking?.claude ?? claude} onStatus={(s) => { onClaude(s); if (thinking && onThinking) onThinking({ ...thinking, claude: s }); }} inUse={(thinking?.route ?? "claude") === "claude"} onUse={() => client.setThinking("claude").then((t) => onThinking?.(t))} />
            <ThinkerRow which="codex" client={client} status={thinking?.codex ?? null} onStatus={(s) => { if (thinking && onThinking) onThinking({ ...thinking, codex: s }); }} inUse={thinking?.route === "codex"} onUse={() => client.setThinking("codex").then((t) => onThinking?.(t))} />
          </SetCard>

          <SetCard title="Reads with" about="The browser Alpha opens pages in, kept on this Mac">
            <BrowserRow client={client} status={browser} onStatus={setBrowser} />
          </SetCard>

          <SetCard title="Appearance" about="How the app and the companion look">
            <div className="item">
              <div className="item__body">
                <b>Theme</b>
                <div className="item__sub">Light, dark, or the same as your Mac</div>
              </div>
              <ThemeControl theme={theme} onChange={onTheme} />
            </div>
            <div className="item">
              <div className="item__body">
                <b>Motion and contrast</b>
                <div className="item__sub">Follow your Mac: less motion and more contrast when you ask your Mac for them</div>
              </div>
            </div>
            {companion !== null ? (
              <div className="item">
                <div className="item__body">
                  <b>Companion</b>
                  <div className="item__sub">Alpha's character, always on top, for quick asks</div>
                </div>
                <button type="button" className={`switch${companion ? "" : " switch--off"}`} role="switch" aria-checked={companion} aria-label={companion ? "Hide the companion" : "Show the companion"} onClick={() => void host.setCompanionVisible(!companion).then((v) => setCompanion(v ?? !companion))} />
              </div>
            ) : null}
            <div className="item item--stack">
              <div className="item__body">
                <b>The companion's look</b>
                <div className="item__sub">The animal and what it wears. It is Alpha whichever you pick; the artwork is Bridge's, with thanks.</div>
              </div>
              <LookPicker client={client} />
            </div>
          </SetCard>

        </div>
        <div className="setcards__col">
          <SetCard id="your-data" title="Your data" about="Your world, kept on this Mac, and copies of it">
            <div className="item">
              <div className="item__body">
                <b>Kept on this Mac</b>
                <div className="item__sub">{data ? `${data.folder} · ${bytes(data.size)}` : "…"}</div>
              </div>
              {host.available() ? (
                <Button size="sm" onClick={() => void host.revealData()}>
                  Show in Finder
                </Button>
              ) : null}
            </div>
            <div className="item">
              <div className="item__body">
                <b>Backups</b>
                <div className="item__sub">{!data ? "…" : last ? `Last ${when(last.at)} · ${data.backups.length} kept` : "None yet"}</div>
              </div>
              <Button size="sm" disabled={busy} onClick={() => { setBusy(true); client.backUp().then(setData).catch(() => undefined).finally(() => setBusy(false)); }}>
                {busy ? "Backing up…" : "Back up now"}
              </Button>
            </div>
          </SetCard>

          <SetCard title="Removed modules" about="Modules you removed, to bring back">
            <p className="empty setcard__empty">Nothing here. Removing a module today deletes it for good; keeping it here so you can bring it back comes later.</p>
          </SetCard>

          <SetCard title="Defaults" about="Set here, used across the app">
            <div className="item">
              <div className="item__body">
                <b>Rows per page</b>
                <div className="item__sub">How many rows a table shows at once</div>
              </div>
              <select className="btn btn--sm" value={String(pageSize)} onChange={(e) => choosePageSize(e.target.value === "fit" ? "fit" : Number(e.target.value))} aria-label="Rows per page">
                <option value="fit">Fit to window</option>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </SetCard>

          <HelpCard />
        </div>
      </div>
    </div>
  );
}
