/**
 * Intelligence › Connections: every folder, site and calendar Alpha can reach, with its state,
 * and the three ways to add one. Deleting one is never a single click: the menu opens a dialog
 * that says what goes with it before the person confirms (the UI rulebook §12 and §14).
 * The connections are the one data view (`intel/sources.ts`); a row's click opens it in a dialog
 * with Read now and Delete. (9 Oct, the pages phase; a data view the same day.)
 */
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data } from "../core/client";
import { DataPage } from "../modules/DataPage";
import { when } from "../modules/format";
import { connectionName, connectionsSource } from "./intel/sources";
import { Badge, Button, Confirm, Dialog, InfoTip, ListRow, Notice, SectionCard, type Tone } from "../ui";
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

export function Connections({ client, data, version, onChanged }: { client: Client; data: Data; version: number; onChanged: () => void }) {
  const [opened, setOpened] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; plan: ConnectionRemoval | null } | null>(null);
  function askRemove(id: string) {
    setRemoving({ id, plan: null });
    client
      .connectionRemoval(id)
      .then((plan) => setRemoving((r) => (r?.id === id ? { id, plan } : r)))
      .catch((e: unknown) => {
        setRemoving(null);
        setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
      });
  }
  async function run(label: string, work: () => Promise<unknown>, ok: string) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  const live = data.connections.filter((c) => c.status !== "off");
  const hasCalendar = live.some((c) => c.connector === "calendar");
  const target = removing ? live.find((c) => c.id === removing.id) : undefined;
  const source = useMemo(() => connectionsSource(client), [client]);
  const open = live.find((c) => c.id === opened);
  const meta = open ? (CONNECTOR[open.connector] ?? { icon: <ConnectionIcon size={ICON} />, reach: "" }) : null;
  return (
    <div className="stack stack--wide">
      <DataPage client={client} source={source} version={version} onChanged={onChanged} onOpenRecord={(_k, id) => setOpened(id)} />
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpened(null)} title={open ? connectionName(open) : "Connection"}>
        {open && meta ? (
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
                <Button size="sm" variant="ghost" onClick={() => { setOpened(null); askRemove(open.id); }}>
                  Delete…
                </Button>
              </>
            }
          />
        ) : null}
      </Dialog>
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
      <Confirm
        open={Boolean(removing)}
        title="Delete this connection?"
        action="Delete connection"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing?.plan) return;
          const id = removing.id;
          void run(id, () => client.removeConnection(id), "Deleted.").then(() => setRemoving(null));
        }}
      >
        <p>{target ? <b>{connectionName(target)}</b> : null}</p>
        <p>{removing?.plan ? removalWords(removing.plan) : "Checking what goes with it…"}</p>
      </Confirm>
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
