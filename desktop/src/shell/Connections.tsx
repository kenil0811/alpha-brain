/**
 * Intelligence › Connections: every folder, site and calendar Alpha can reach, with its state,
 * and Connect (a folder, a site, the calendar) in the data view's toolbar (12 Oct, the owner). Deleting one is never a single click: the menu opens a dialog
 * that says what goes with it before the person confirms (the UI rulebook §12 and §14).
 * The connections are the one data view (`intel/sources.ts`); a row's click opens the
 * connection's own page (`#/intelligence/connections/<id>`) with Read now and Delete, and a back
 * link to the list (9 Oct, the owner: a page with its address, not a dialog).
 */
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { say } from "../core/client";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data } from "../core/client";
import { DataPage } from "../modules/DataPage";
import { when } from "../modules/format";
import { BackLink } from "./BackLink";
import { connectionName, connectionsSource } from "./intel/sources";
import { Badge, Button, Confirm, Dialog, EmptyCard, IconButton, InfoTip, ListRow, Menu, MenuItem, Notice, PageHeader, SectionCard, Trouble, type ContextItem, type Tone } from "../ui";
import { Calendar, ConnectionIcon, FolderOpen, Globe, ICON, ICON_SM, MoreVertical, PlusIcon } from "../ui/icons";

const CONNECTOR: Record<string, { icon: ReactNode; reach: string }> = {
  files: { icon: <FolderOpen size={ICON} />, reach: "Reads the documents in this folder as they change; never changes your files" },
  browser: { icon: <Globe size={ICON} />, reach: "Reads pages the way you would; never posts, messages or clicks" },
  calendar: { icon: <Calendar size={ICON} />, reach: "Reads events and attendees; adds nothing without a yes" },
};

const STATUS: Record<Connection["status"], { tone: Tone; words: string }> = {
  connected: { tone: "good", words: "Working" },
  needs_ok: { tone: "warn", words: "Needs your sign-in" },
  broken: { tone: "bad", words: "Being repaired" },
  off: { tone: "gray", words: "Off" },
};

/** What deleting a connection takes with it: the same words Activity records afterwards. */
function removalWords(plan: ConnectionRemoval): string {
  return `This deletes ${plan.what}. ${plan.connector === "files" ? "Your files stay." : "Your tables keep their records."}`;
}

/** Run one call, saying what came of it. */
function useRun(onChanged: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(label: string, work: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(label);
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: ok });
      onChanged();
      return true;
    } catch (e) {
      setMessage({ ok: false, text: say(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, message, setMessage, run };
}

export function Connections({ client, data, version, onChanged, onOpen }: { client: Client; data: Data; version: number; onChanged: () => void; onOpen?: (id: string) => void }) {
  const [asking, setAsking] = useState<"folder" | "site" | null>(null);
  const [text, setText] = useState("");
  const { busy, message, run } = useRun(onChanged);
  const hasCalendar = data.connections.some((c) => c.status !== "off" && c.connector === "calendar");
  const source = useMemo(() => connectionsSource(client), [client]);
  const ask = (k: "folder" | "site") => {
    setText("");
    setAsking(k);
  };
  const connect: ContextItem = {
    label: "Connect",
    icon: <PlusIcon size={ICON_SM} />,
    disabled: busy !== null ? "Connecting…" : undefined,
    children: [
      { label: "A folder…", icon: <FolderOpen size={ICON_SM} />, onSelect: () => ask("folder") },
      { label: "A site you sign into…", icon: <Globe size={ICON_SM} />, onSelect: () => ask("site") },
      { label: "Your calendar", icon: <Calendar size={ICON_SM} />, disabled: hasCalendar ? "Your calendars are already connected." : undefined, onSelect: () => void run("calendar", () => client.connectCalendar(), "Calendars connected.") },
    ],
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    setAsking(null);
    if (asking === "folder") void run("folder", () => client.connectFolder(v), "Alpha is reading the folder.");
    else void run("site", () => client.connectSite(v), "A window is open: sign in there, then close it.");
  };
  return (
    <div className="stack stack--wide">
      <DataPage client={client} source={source} version={version} onChanged={onChanged} actions={[connect]} onOpenRecord={(_k, id) => onOpen?.(id)} />
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
      <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)} title={asking === "site" ? "Connect a site you sign into" : "Connect a folder"}>
        <form className="row" onSubmit={submit}>
          <input autoFocus className="textfield" value={text} onChange={(e) => setText(e.target.value)} placeholder={asking === "site" ? "linkedin.com" : "~/Documents/Job search"} aria-label={asking === "site" ? "Site" : "Folder"} />
          {asking === "site" ? <InfoTip text="A window opens; you sign in yourself" /> : null}
          <Button variant="primary" type="submit" disabledReason={text.trim() ? undefined : "Type it first."}>
            {asking === "site" ? "Sign in" : "Read it"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

/** A connection's own page: what it reaches, its state, Read now, and Delete, which first says
 *  what goes with it. Back returns to Connections. */
export function ConnectionPage({ client, id, version, onBack, onChanged }: { client: Client; id: string; version: number; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [removing, setRemoving] = useState<ConnectionRemoval | "checking" | null>(null);
  const { busy, message, setMessage, run } = useRun(() => {
    onChanged();
    setTick((n) => n + 1);
  });
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, tick]);
  const open = data?.connections.find((c) => c.id === id);
  const meta = open ? (CONNECTOR[open.connector] ?? { icon: <ConnectionIcon size={ICON} />, reach: "" }) : null;
  function askRemove() {
    setRemoving("checking");
    client
      .connectionRemoval(id)
      .then(setRemoving)
      .catch((e: unknown) => {
        setRemoving(null);
        setMessage({ ok: false, text: say(e) });
      });
  }
  const back = <BackLink to="Connections" onClick={onBack} />;
  return (
    <>
      <PageHeader
        left={back}
        title={open ? connectionName(open) : "Connection"}
        right={
          open ? (
            // Delete lives in ⋮, never as a standing button (rule 13), and asks first
            <Menu trigger={<IconButton label="More" icon={<MoreVertical />} />}>
              <MenuItem danger onSelect={askRemove}>
                Delete…
              </MenuItem>
            </Menu>
          ) : undefined
        }
      />
      <div className="page page--narrow">
        {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load the connection: {error}</Trouble> : null}
        {!data && !error ? <p className="faint">Loading…</p> : null}
        {data && !open ? <EmptyCard icon={<ConnectionIcon size={ICON} />} title="No such connection" /> : null}
        {open && meta ? (
          <SectionCard title="Connection">
            <ListRow
              icon={meta.icon}
              title={connectionName(open)}
              description={[open.last_sync ? `Last read ${when(open.last_sync)}` : "", open.last_error ?? ""].filter(Boolean).join(" · ") || undefined}
              controls={
                <>
                  {meta.reach ? <InfoTip text={meta.reach} /> : null}
                  <Badge tone={STATUS[open.status].tone}>{STATUS[open.status].words}</Badge>
                  <Button size="sm" disabled={busy !== null} onClick={() => void run(open.id, () => client.syncConnection(open.id), "Read again.")}>
                    {open.connector === "browser" ? "Check" : "Read now"}
                  </Button>
                </>
              }
            />
            {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          </SectionCard>
        ) : null}
        <Confirm
          open={removing !== null}
          title="Delete this connection?"
          action="Delete connection"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            if (!removing || removing === "checking") return;
            void run(id, () => client.removeConnection(id), "Deleted.").then((ok) => {
              setRemoving(null);
              if (ok) onBack();
            });
          }}
        >
          <p>{open ? <b>{connectionName(open)}</b> : null}</p>
          <p>{removing && removing !== "checking" ? removalWords(removing) : "Checking what goes with it…"}</p>
        </Confirm>
      </div>
    </>
  );
}
