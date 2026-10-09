/**
 * Settings: only what a person decides (the UI rulebook §13). A header with an icon tile, the
 * title and one line; a list of sections on the left; readable cards, in a centred narrow
 * column, on the right. Each row says what is so and offers the one thing to do about it;
 * what is not configurable yet is an empty card that says so, never a hidden control. The
 * section that is open lives in this component's state, not the address (9 Oct, the pages
 * phase). Sections: Workspace, Thinks with, Appearance, Companion, Notifications, Permissions,
 * Builder rules, Defaults, Your data, Removed modules, Help.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LookPicker } from "../avatar/LookPicker";
import type { ClaudeStatus, Client, DataInfo, Intelligence as IntelData, ThinkRoute, Thinking } from "../core/client";
import { host } from "../core/host";
import { PREF, usePreference } from "../core/preferences";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { ThemeControl, type Theme } from "./theme";
import { Badge, Button, Dropdown, EmptyCard, ListRow, Notice, PageHeader, SectionCard, Tabs, Trouble } from "../ui";
import { AppearanceIcon, BuilderIcon, CompanionIcon, DataIcon, DefaultsIcon, HelpIcon, ICON, NotificationIcon, PermissionIcon, RemovedIcon, SettingsIcon, ThinksIcon, WorkspaceIcon } from "../ui/icons";

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
export function ThinkerRow({ which, client, status, onStatus, inUse, onUse }: { which: ThinkRoute; client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; inUse?: boolean; onUse?: () => void }) {
  const [waiting, setWaiting] = useState<"install" | "signin" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = which === "claude" ? "Claude" : "ChatGPT";
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
    <ListRow
      icon={<ThinksIcon size={ICON} />}
      title={name}
      description={<span className={confirming ? "lrow__warn" : undefined}>{words}</span>}
      controls={
        <>
          {inUse ? <Badge tone="good">In use</Badge> : onUse && connected ? (
            <Button size="sm" onClick={onUse}>
              Use this
            </Button>
          ) : null}
          {status ? <Badge tone={connected ? "good" : "warn"}>{connected ? "Connected" : "Not connected"}</Badge> : null}
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
        </>
      }
    >
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </ListRow>
  );
}

/** The chosen way to think, for the first run. */
export function ClaudeRow({ client, status, onStatus, which = "claude" }: { client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; which?: ThinkRoute }) {
  return <ThinkerRow which={which} client={client} status={status} onStatus={onStatus} />;
}

type SectionId = "workspace" | "thinks" | "appearance" | "companion" | "notifications" | "permissions" | "builder" | "defaults" | "data" | "removed" | "help";
const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "workspace", label: "Workspace", icon: <WorkspaceIcon size={ICON} /> },
  { id: "thinks", label: "Thinks with", icon: <ThinksIcon size={ICON} /> },
  { id: "appearance", label: "Appearance", icon: <AppearanceIcon size={ICON} /> },
  { id: "companion", label: "Companion", icon: <CompanionIcon size={ICON} /> },
  { id: "notifications", label: "Notifications", icon: <NotificationIcon size={ICON} /> },
  { id: "permissions", label: "Permissions", icon: <PermissionIcon size={ICON} /> },
  { id: "builder", label: "Builder rules", icon: <BuilderIcon size={ICON} /> },
  { id: "defaults", label: "Defaults", icon: <DefaultsIcon size={ICON} /> },
  { id: "data", label: "Your data", icon: <DataIcon size={ICON} /> },
  { id: "removed", label: "Removed modules", icon: <RemovedIcon size={ICON} /> },
  { id: "help", label: "Help", icon: <HelpIcon size={ICON} /> },
];

const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "⌘K", does: "Search everything, from anywhere" },
  { keys: "Enter", does: "Send what you wrote to Alpha" },
  { keys: "Shift+Enter", does: "A new line in what you are writing" },
  { keys: "Escape", does: "Close, cancel, or step back" },
  { keys: "F2", does: "Edit the selected cell in a table" },
  { keys: "Shift+F10", does: "Open the context menu of what is focused" },
];

/** The workspace's name: kept with the person's other choices about their world, then every
 *  place that shows it (the sidebar's workspace button) hears it at once. */
function WorkspaceCard({ client, onChanged }: { client: Client; onChanged?: () => void }) {
  const [stored, change] = usePreference<string>(client, PREF.workspaceName, "Alpha");
  const name = typeof stored === "string" && stored.trim() ? stored : "Alpha";
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setDraft(name), [name]);
  async function save() {
    const problem = await change(draft.trim());
    if (problem) {
      setSaved({ ok: false, text: problem });
      return;
    }
    setSaved({ ok: true, text: "Saved." });
    onChanged?.();
  }
  return (
    <SectionCard title="Workspace" subtitle="Your one world, kept on this Mac">
      <div className="setname">
        <span className="wstile" aria-hidden="true">
          {(draft.trim()[0] ?? name[0] ?? "A").toUpperCase()}
        </span>
        <form className="setname__form" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && draft.trim() !== name) void save(); }}>
          <label className="setlabel" htmlFor="workspace-name">
            Name
          </label>
          <div className="row">
            <input id="workspace-name" className="textfield" value={draft} onChange={(e) => { setDraft(e.target.value); setSaved(null); }} />
            <Button variant="primary" type="submit" disabled={!draft.trim() || draft.trim() === name}>
              Save
            </Button>
            {saved ? <Notice tone={saved.ok ? "ok" : "bad"}>{saved.text}</Notice> : null}
          </div>
        </form>
      </div>
      <ListRow title="Manage Workspace" description="Colour, members and plan." controls={<Button size="sm" disabledReason="There is one workspace per person today; managing it needs accounts, which Alpha doesn't have yet.">Manage Workspace</Button>} />
      <ListRow title="Sign out" description="Leave this workspace on this Mac." controls={<Button size="sm" variant="ghost" disabledReason="There is no account to sign out of: your workspace lives on this Mac.">Sign out</Button>} />
    </SectionCard>
  );
}

function PermissionsCard({ client, onChanged }: { client: Client; onChanged?: () => void }) {
  const [data, setData] = useState<IntelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, tick]);
  async function revoke(id: string) {
    try {
      await client.revokePermission(id);
      setMessage({ ok: true, text: "Revoked." });
      setTick((n) => n + 1);
      onChanged?.();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  const permissions = data?.knowledge.permissions ?? [];
  return (
    <SectionCard title="Permissions" subtitle="What Alpha may do without asking; anything that reaches someone asks every time">
      {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load permissions: {error}</Trouble> : null}
      {!data && !error ? <p className="faint">Loading permissions…</p> : null}
      {data && !permissions.length ? <EmptyCard icon={<PermissionIcon size={ICON} />} title="Nothing configured yet">When Alpha proposes a draft or a message, “Always allow” on its card makes a standing permission, and it appears here.</EmptyCard> : null}
      {permissions.map((p) => (
        <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} description={`Allowed since ${when(p.granted_at)}`} controls={<Button size="sm" variant="ghost" onClick={() => void revoke(p.id)}>Revoke</Button>} />
      ))}
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
    </SectionCard>
  );
}

function HelpCard() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!host.available()) return;
    // the host knows its version; a browser tab has none, and says Unknown
    void import("@tauri-apps/api/app").then((m) => m.getVersion()).then(setVersion).catch(() => undefined);
  }, []);
  return (
    <>
      <SectionCard title="Keyboard shortcuts" subtitle="What the window supports">
        {SHORTCUTS.map((s) => (
          <ListRow key={s.keys} title={<kbd className="kbd">{s.keys}</kbd>} description={s.does} />
        ))}
      </SectionCard>
      <SectionCard title="About">
        <ListRow title="Version" description={version ?? "Unknown"} />
      </SectionCard>
    </>
  );
}

export function Settings({ client, theme, onTheme, claude, onClaude, thinking, onThinking, onChanged }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; thinking?: Thinking | null; onThinking?: (t: Thinking) => void; onChanged?: () => void }) {
  const [section, setSection] = useState<SectionId>("workspace");
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [data, setData] = useState<DataInfo | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize);
  const [busy, setBusy] = useState(false);

  const [trouble, setTrouble] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
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
  const panel = (() => {
    switch (section) {
      case "workspace":
        return <WorkspaceCard client={client} onChanged={onChanged} />;
      case "thinks":
        return (
          <SectionCard title="Thinks with" subtitle="Claude through Claude Code, or ChatGPT through the Codex CLI; each on your own subscription">
            <ThinkerRow which="claude" client={client} status={thinking?.claude ?? claude} onStatus={(s) => { onClaude(s); if (thinking && onThinking) onThinking({ ...thinking, claude: s }); }} inUse={(thinking?.route ?? "claude") === "claude"} onUse={() => void client.setThinking("claude").then((t) => onThinking?.(t))} />
            <ThinkerRow which="codex" client={client} status={thinking?.codex ?? null} onStatus={(s) => { if (thinking && onThinking) onThinking({ ...thinking, codex: s }); }} inUse={thinking?.route === "codex"} onUse={() => void client.setThinking("codex").then((t) => onThinking?.(t))} />
          </SectionCard>
        );
      case "appearance":
        return (
          <SectionCard title="Appearance" subtitle="How Alpha looks in this window">
            <ListRow title="Theme" description="Light, dark, or the same as your Mac" controls={<ThemeControl theme={theme} onChange={onTheme} />} />
            <ListRow title="Motion" description="Follows your Mac's Reduce motion setting." />
            <ListRow title="Contrast" description="Follows your Mac's Increase contrast setting." />
          </SectionCard>
        );
      case "companion":
        return (
          <SectionCard title="Companion" subtitle="Alpha's character, always on top, for quick asks">
            <ListRow
              title="Show the companion"
              description={companion === null ? "It lives in the Mac app." : companion ? "On" : "Off"}
              controls={
                companion !== null ? (
                  <button type="button" className={`switch${companion ? "" : " switch--off"}`} role="switch" aria-checked={companion} aria-label={companion ? "Hide the companion" : "Show the companion"} onClick={() => void host.setCompanionVisible(!companion).then((v) => setCompanion(v ?? !companion))} />
                ) : (
                  <Button size="sm" disabledReason="The companion is part of the Mac app; it isn't running in this window.">
                    Show
                  </Button>
                )
              }
            />
            <ListRow title="Look and size" description="The animal and what it wears. It is Alpha whichever you pick; the artwork is Bridge's, with thanks.">
              <LookPicker client={client} />
            </ListRow>
          </SectionCard>
        );
      case "notifications":
        return (
          <EmptyCard icon={<NotificationIcon size={ICON} />} title="Nothing configured yet">
            Alpha doesn't interrupt you with notifications yet; when it can, what may interrupt you, and when, is set here.
          </EmptyCard>
        );
      case "permissions":
        return <PermissionsCard client={client} onChanged={onChanged} />;
      case "builder":
        return (
          <EmptyCard icon={<BuilderIcon size={ICON} />} title="Nothing configured yet">
            How Alpha makes modules (default views, metrics, naming) will be set here once the core keeps those rules.
          </EmptyCard>
        );
      case "defaults":
        return (
          <SectionCard title="Defaults" subtitle="How tables start out">
            <ListRow title="Rows per page" description="How many records a table shows at once" controls={<Dropdown size="sm" label="Rows per page" value={String(pageSize)} onChange={(v) => choosePageSize(v === "fit" ? "fit" : Number(v))} options={[{ value: "fit", label: "Fit to window" }, ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))]} />} />
          </SectionCard>
        );
      case "data":
        return (
          <SectionCard title="Your data" subtitle="Where your world is kept, and copies of it">
            <ListRow
              title="Kept on this Mac"
              description={data ? `${data.folder} · ${bytes(data.size)}` : trouble ? "Unknown" : "Loading…"}
              controls={
                host.available() ? (
                  <Button size="sm" onClick={() => void host.revealData()}>
                    Show in Finder
                  </Button>
                ) : (
                  <Button size="sm" disabledReason="Showing the folder needs the Mac app; this window is running in a browser.">
                    Show in Finder
                  </Button>
                )
              }
            />
            <ListRow
              title="Backups"
              description={!data ? (trouble ? "Unknown" : "Loading…") : last ? `Last ${when(last.at)} · ${data.backups.length} kept` : "None yet"}
              controls={
                <Button size="sm" disabled={busy || !data} onClick={() => { setBusy(true); client.backUp().then(setData).catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}>
                  {busy ? "Backing up…" : "Back up now"}
                </Button>
              }
            />
          </SectionCard>
        );
      case "removed":
        return (
          <EmptyCard icon={<RemovedIcon size={ICON} />} title="Nothing configured yet">
            Modules you remove while keeping their data will be listed here with Restore, once the core keeps them.
          </EmptyCard>
        );
      case "help":
        return <HelpCard />;
    }
  })();

  return (
    <>
      <PageHeader
        centre={
          <div className="sethead">
            <span className="sethead__tile" aria-hidden="true">
              <SettingsIcon size={ICON} />
            </span>
            <h1 className="pagehead__title serif">Settings</h1>
            <span className="sethead__sub">How Alpha thinks, looks and keeps your data</span>
          </div>
        }
      />
      <div className="page setpage">
        <Tabs
          className="setnav"
          label="Settings sections"
          value={section}
          onChange={setSection}
          items={SECTIONS.map((s) => ({
            id: s.id,
            label: (
              <>
                <span className="setnav__dot" aria-hidden="true" />
                <span className="setnav__ico" aria-hidden="true">
                  {s.icon}
                </span>
                {s.label}
              </>
            ),
          }))}
        />
        <div className="setpanel" role="tabpanel" aria-label={SECTIONS.find((s) => s.id === section)?.label}>
          {trouble ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Settings: {trouble}</Trouble> : null}
          {panel}
        </div>
      </div>
    </>
  );
}
