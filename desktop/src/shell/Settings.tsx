/**
 * Settings: only what a person decides (the UI rulebook §13). Every section is a card, all of
 * them at once, flowing in as many columns as the window has room for (9 Oct, Vikas: the narrow
 * column with a section list left most of the window empty). Each row says what is so and offers
 * the one thing to do about it, with as few words as it takes; what is not configurable yet says
 * so, never a hidden control. Sections: Workspace, Thinks with, Appearance, Companion,
 * Notifications, Permissions, Builder rules, Defaults, Your data, Removed modules, Help.
 */
import { useCallback, useEffect, useState } from "react";
import { LookPicker } from "../avatar/LookPicker";
import type { ClaudeStatus, Client, DataInfo, Intelligence as IntelData, ThinkRoute, Thinking } from "../core/client";
import { host } from "../core/host";
import { PREF, usePreference } from "../core/preferences";
import { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../modules/DataPage";
import { when } from "../modules/format";
import { WorkspaceTile } from "./Rail";
import { ThemeControl, type Theme } from "./theme";
import { Badge, Button, Dropdown, InfoTip, ListRow, Notice, PageHeader, SectionCard, Trouble } from "../ui";
import { ICON, PermissionIcon, ThinksIcon } from "../ui/icons";

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

const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "⌘K", does: "Search everything, from anywhere" },
  { keys: "Enter", does: "Send what you wrote to Alpha" },
  { keys: "Shift+Enter", does: "A new line in what you are writing" },
  { keys: "Escape", does: "Close, cancel, or step back" },
  { keys: "F2", does: "Edit the selected cell in a table" },
  { keys: "Shift+F10", does: "Open the context menu of what is focused" },
];

/** The workspace's name: kept with the person's other choices about their world, then every
 *  place that shows it (the sidebar's workspace button) hears it at once. The sidebar also
 *  renames it, and changes its logo, on a double-click. */
function WorkspaceCard({ client, onChanged }: { client: Client; onChanged?: () => void }) {
  const [stored, change] = usePreference<string>(client, PREF.workspaceName, "Alpha");
  const [logo] = usePreference<string | null>(client, PREF.workspaceLogo, null);
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
    <SectionCard title="Workspace">
      <form className="setname" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && draft.trim() !== name) void save(); }}>
        <WorkspaceTile logo={typeof logo === "string" ? logo : ""} name={draft.trim() || name} className="wstile" />
        <input className="textfield setname__input" aria-label="Name" value={draft} onChange={(e) => { setDraft(e.target.value); setSaved(null); }} />
        <Button variant="primary" type="submit" disabled={!draft.trim() || draft.trim() === name}>
          Save
        </Button>
        <InfoTip text="Double-click the name or the tile in the sidebar to change them there." />
      </form>
      {saved ? <Notice tone={saved.ok ? "ok" : "bad"}>{saved.text}</Notice> : null}
      <div className="row">
        <Button size="sm" disabledReason="One workspace per person today; managing it needs accounts.">
          Manage Workspace
        </Button>
        <Button size="sm" variant="ghost" disabledReason="There is no account to sign out of: your workspace lives on this Mac.">
          Sign out
        </Button>
      </div>
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
    <SectionCard title="Permissions">
      {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load permissions: {error}</Trouble> : null}
      {!data && !error ? <p className="faint">Loading permissions…</p> : null}
      {data && !permissions.length ? (
        <p className="faint">
          None yet <InfoTip text="“Always allow” on a proposal's card adds one here. Anything that reaches someone still asks every time." />
        </p>
      ) : null}
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
    <SectionCard title="Help">
      <dl className="setkeys">
        {SHORTCUTS.map((s) => (
          <div key={s.keys}>
            <dt>
              <kbd className="kbd">{s.keys}</kbd>
            </dt>
            <dd>{s.does}</dd>
          </div>
        ))}
      </dl>
      <ListRow title="Version" description={version ?? "Unknown"} />
    </SectionCard>
  );
}

export function Settings({ client, theme, onTheme, claude, onClaude, thinking, onThinking, onChanged }: { client: Client; theme: Theme; onTheme: (t: Theme) => void; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void; thinking?: Thinking | null; onThinking?: (t: Thinking) => void; onChanged?: () => void }) {
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
  const notYet = (title: string, tip: string) => (
    <SectionCard title={title}>
      <p className="faint">
        Nothing configured yet <InfoTip text={tip} />
      </p>
    </SectionCard>
  );

  return (
    <>
      <PageHeader title="Settings" />
      <div className="page setgrid">
        {trouble ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Settings: {trouble}</Trouble> : null}
        <WorkspaceCard client={client} onChanged={onChanged} />
        <SectionCard title="Thinks with" subtitle="Which assistant answers, and the model behind Quick overview and Deep thinking. The composer picks the depth, never the model.">
          <ThinkerRow which="claude" client={client} status={thinking?.claude ?? claude} onStatus={(s) => { onClaude(s); if (thinking && onThinking) onThinking({ ...thinking, claude: s }); }} inUse={(thinking?.route ?? "claude") === "claude"} onUse={() => void client.setThinking("claude").then((t) => onThinking?.(t))} />
          <ThinkerRow which="codex" client={client} status={thinking?.codex ?? null} onStatus={(s) => { if (thinking && onThinking) onThinking({ ...thinking, codex: s }); }} inUse={thinking?.route === "codex"} onUse={() => void client.setThinking("codex").then((t) => onThinking?.(t))} />
          <ListRow title="Quick overview and Deep thinking" description="Every answer is a quick overview for now, on the chosen assistant's own model: choosing depth, and a model for each, needs Alpha's core." />
        </SectionCard>
        <SectionCard title="Appearance">
          <ListRow title="Theme" controls={<ThemeControl theme={theme} onChange={onTheme} />} />
          <ListRow title="Motion and contrast" description="Follow your Mac" />
        </SectionCard>
        <SectionCard title="Companion">
          <ListRow
            title="Show the companion"
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
          <ListRow title="Look and size" description="Artwork by Bridge, with thanks.">
            <LookPicker client={client} />
          </ListRow>
        </SectionCard>
        <PermissionsCard client={client} onChanged={onChanged} />
        <SectionCard title="Defaults">
          <ListRow title="Rows per page" controls={<Dropdown size="sm" label="Rows per page" value={String(pageSize)} onChange={(v) => choosePageSize(v === "fit" ? "fit" : Number(v))} options={[{ value: "fit", label: "Fit to window" }, ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))]} />} />
        </SectionCard>
        <SectionCard title="Your data">
          <ListRow
            title="On this Mac"
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
        {notYet("Notifications", "What may interrupt you, and when. Alpha doesn't send notifications yet.")}
        {notYet("Builder rules", "How Alpha makes modules: default views, metrics, naming. Needs the core to keep these rules.")}
        {notYet("Removed modules", "Modules removed with their data kept, with Restore. Needs the core to keep them.")}
        <HelpCard />
      </div>
    </>
  );
}
