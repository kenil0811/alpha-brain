/**
 * Intelligence › Connections: every folder, site and calendar Alpha can reach, with its state,
 * and the three ways to add one. Deleting one is never a single click: the menu opens a dialog
 * that says what goes with it before the person confirms (the UI rulebook §12 and §14).
 * The connections are the one data view (`intel/sources.ts`); a row's click opens the
 * connection's own page (`#/intelligence/connections/<id>`) with Read now and Delete, and a back
 * link to the list (9 Oct, the owner: a page with its address, not a dialog).
 */
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data } from "../core/client";
import { DataPage } from "../modules/DataPage";
import { when } from "../modules/format";
import { BackLink } from "./BackLink";
import { connectionName, connectionsSource } from "./intel/sources";
import { Badge, Button, Confirm, EmptyCard, InfoTip, ListRow, Notice, PageHeader, SectionCard, Trouble, type Tone } from "../ui";
import { Calendar, ConnectionIcon, FolderOpen, Globe, ICON } from "../ui/icons";

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
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, message, setMessage, run };
}

export function Connections({ client, data, version, onChanged, onOpen }: { client: Client; data: Data; version: number; onChanged: () => void; onOpen?: (id: string) => void }) {
  const [folder, setFolder] = useState("");
  const [site, setSite] = useState("");
  const { busy, message, run } = useRun(onChanged);
  const hasCalendar = data.connections.some((c) => c.status !== "off" && c.connector === "calendar");
  const source = useMemo(() => connectionsSource(client), [client]);
  return (
    <div className="stack stack--wide">
      <DataPage client={client} source={source} version={version} onChanged={onChanged} onOpenRecord={(_k, id) => onOpen?.(id)} />
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
      <div className="addgrid">
        <SectionCard title="A folder">
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("folder", () => client.connectFolder(folder.trim()), "Alpha is reading the folder."); }}>
            <input className="textfield" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <Button variant="primary" type="submit" disabled={!folder.trim() || busy !== null}>
              Read it
            </Button>
          </form>
        </SectionCard>
        <SectionCard title="A site you sign into" actions={<InfoTip text="A window opens; you sign in yourself" />}>
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
            <input className="textfield" value={site} onChange={(e) => setSite(e.target.value)} placeholder="linkedin.com" aria-label="Site" />
            <Button variant="primary" type="submit" disabled={!site.trim() || busy !== null}>
              Sign in
            </Button>
          </form>
        </SectionCard>
        {!hasCalendar ? (
          <SectionCard title="Your calendar">
            <Button variant="primary" disabled={busy !== null} onClick={() => void run("calendar", () => client.connectCalendar(), "Calendars connected.")}>
              Connect calendars
            </Button>
          </SectionCard>
        ) : null}
      </div>
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
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
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
        setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
      });
  }
  const back = <BackLink to="Connections" onClick={onBack} />;
  return (
    <>
      <PageHeader left={back} title={open ? connectionName(open) : "Connection"} />
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
                  <Button size="sm" variant="ghost" onClick={askRemove}>
                    Delete…
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
