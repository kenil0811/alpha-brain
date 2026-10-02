/**
 * The composer's "+" button, after Alpha's AttachMenu: add files, images, a folder or an audio
 * file to the next message, and Advanced -> Model (which model this conversation's messages go
 * to) and Advanced -> Access (how much Alpha may do here before it asks). Both are kept per
 * conversation by the core; a non-default access mode shows as a chip beside "+". The
 * removable chips above the box show what is queued. Shared by the Chief of Staff panel and the
 * companion.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, File, FileAudio, FolderClosed, Image as ImageIcon, Plus, Settings2, X } from "lucide-react";
import type { AccessMode, Client, ModelProvider, ModelRoute, ProviderModel } from "../core/client";
import { PROJECT_FILE } from "../shell/ProjectMenu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, IconButton, useOptionalToast } from "../ui";
import { type PendingAttachment, pickAudioFile, pickFilesOrImages, pickFolder, registerAttachmentHandler, sizeLabel, toWire, unclaimed } from "./attachments";

export const ACCESS_MODES: AccessMode[] = ["ask", "approve_for_me", "full"];
export const ACCESS_MODE_COPY: Record<AccessMode, { title: string; hint: string }> = {
  ask: { title: "Ask for approval", hint: "Always ask to edit external files and use the internet" },
  approve_for_me: { title: "Approve for me", hint: "Only ask for actions detected as potentially unsafe" },
  full: { title: "Full access", hint: "Unrestricted access to the internet and any file on your computer" },
};

function decodeJson(b64: string): unknown {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
}

/** Queued attachments for one composer: add (a pick, a drop or a paste), remove, clear on send.
 *  An exported project file never rides along: attaching it installs the project and opens it. */
export function useAttachments(client: Client) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const toast = useOptionalToast();
  useEffect(
    () =>
      registerAttachmentHandler(
        (a) => a.name.toLowerCase().endsWith(PROJECT_FILE),
        (a) => {
          let bundle: unknown;
          try {
            bundle = a.contentB64 ? decodeJson(a.contentB64) : a.path ? { path: a.path } : null;
          } catch {
            bundle = null;
          }
          if (!bundle) {
            toast?.show("Couldn't read that project file.");
            return;
          }
          client
            .importModule(bundle)
            .then((m) => {
              toast?.show(`Added ${m.name}`);
              window.history.pushState(null, "", `#/m/${encodeURIComponent(m.id)}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
            })
            .catch((e: unknown) => toast?.show(e instanceof Error ? e.message : "Couldn't add that project."));
        },
      ),
    [client, toast],
  );
  const add = useCallback((incoming: PendingAttachment[]) => setItems((cur) => [...cur, ...unclaimed(incoming, cur.length)]), []);
  const remove = useCallback((id: string) => setItems((cur) => cur.filter((a) => a.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const wire = useCallback(() => items.map(toWire), [items]);
  return { items, add, remove, clear, wire };
}

/** This conversation's access mode, as the core keeps it. */
export function useAccess(client: Client, thread: string | null) {
  const [mode, setMode] = useState<AccessMode>("ask");
  useEffect(() => {
    let live = true;
    client
      .access(thread)
      .then((a) => live && setMode(a.mode))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, thread]);
  const choose = useCallback(
    (next: AccessMode) => {
      setMode(next);
      client.setAccess(thread, next).then((a) => setMode(a.mode), () => undefined);
    },
    [client, thread],
  );
  return { mode, choose };
}

export function AttachMenu({ client, thread, onAdd }: { client: Client; thread: string | null; onAdd: (items: PendingAttachment[]) => void }) {
  const [rows, setRows] = useState<ModelProvider[] | null>(null);
  const [route, setRoute] = useState<ModelRoute | null>(null);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const access = useAccess(client, thread);

  const loadModels = (provider: string) => {
    setModels([]);
    client
      .providerModels(provider)
      .then((p) => setModels(p.models))
      .catch(() => undefined);
  };
  const onOpen = (open: boolean) => {
    if (!open) return;
    client.modelProviders().then((all) => setRows(all.filter((r) => !r.transcribe_only)), () => undefined);
    client.route(thread).then((r) => {
      setRoute(r);
      loadModels(r.provider);
    }, () => undefined);
  };
  const choose = (provider: string | null, model: string | null = null) => {
    client.setRoute(thread, provider, model).then((r) => {
      setRoute(r);
      if (r.provider !== route?.provider) loadModels(r.provider);
    }, () => undefined);
  };
  const chooseFull = () => {
    if (window.confirm("Full access lets Alpha use the internet and edit any file on this computer without asking first. Continue?")) access.choose("full");
  };

  const star = rows?.find((r) => r.default)?.id;
  const active = rows?.find((r) => r.id === route?.provider);
  const current = models.find((m) => m.id === route?.model);
  const chip = access.mode !== "ask" ? ACCESS_MODE_COPY[access.mode].title : null;
  return (
    <DropdownMenu onOpenChange={onOpen}>
      <DropdownMenuTrigger asChild>
        <span className="attach-trigger composer__plus">
          <IconButton aria-label="Add files, folders, images or audio" size="sm">
            <Plus size={14} aria-hidden="true" />
          </IconButton>
          {chip ? <span className={`attach-trigger__chip${access.mode === "full" ? " attach-trigger__chip--full" : ""}`}>{chip}</span> : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void pickFilesOrImages().then(onAdd)}>
          <ImageIcon size={14} aria-hidden="true" /> Add files or images
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pickFolder().then(onAdd)}>
          <FolderClosed size={14} aria-hidden="true" /> Add a folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pickAudioFile().then(onAdd)}>
          <FileAudio size={14} aria-hidden="true" /> Add audio file
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Settings2 size={14} aria-hidden="true" /> Advanced
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {rows?.length ? (
              <>
                <DropdownMenuLabel>Model</DropdownMenuLabel>
                {rows.map((r) => {
                  const ticked = r.id === route?.provider;
                  return (
                    <DropdownMenuItem key={r.id} onSelect={() => choose(r.id === star ? null : r.id)}>
                      <span className={`ui-menu__dot ui-menu__dot--${r.dot.color}`} title={r.dot.tooltip} aria-hidden="true" />
                      <span className="ui-menu__body truncate">
                        {r.label}
                        {r.id === star ? " (default)" : ""}
                      </span>
                      {ticked ? <Check size={14} aria-hidden="true" className="ui-menu__check" /> : <span className="ui-menu__check" />}
                    </DropdownMenuItem>
                  );
                })}
                {active && models.length ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <span className="ui-menu__check" />
                      <span className="ui-menu__body truncate">
                        {active.label} model{current ? ` · ${current.label}` : ""}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {models.map((m) => (
                        <DropdownMenuItem key={m.id} onSelect={() => choose(active.id, m.id)}>
                          {m.id === route?.model ? <Check size={14} aria-hidden="true" className="ui-menu__check" /> : <span className="ui-menu__check" />}
                          <span className="ui-menu__body truncate">{m.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuLabel>Access</DropdownMenuLabel>
            {ACCESS_MODES.map((mode) => (
              <DropdownMenuItem key={mode} className={mode === "full" ? "ui-menu__item--warning" : ""} onSelect={() => (mode === "full" ? chooseFull() : access.choose(mode))}>
                {access.mode === mode ? <Check size={14} aria-hidden="true" className="ui-menu__check" /> : <span className="ui-menu__check" />}
                <span className="ui-menu__body">
                  {ACCESS_MODE_COPY[mode].title}
                  <div className="ui-menu__sub-label">{ACCESS_MODE_COPY[mode].hint}</div>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function iconFor(kind: PendingAttachment["kind"]) {
  if (kind === "image") return <ImageIcon size={14} aria-hidden="true" />;
  if (kind === "audio") return <FileAudio size={14} aria-hidden="true" />;
  if (kind === "folder") return <FolderClosed size={14} aria-hidden="true" />;
  return <File size={14} aria-hidden="true" />;
}

/** What is queued on the next message (with ×), or, without `onRemove`, what a sent one carried. */
export function AttachmentChips({ items, onRemove }: { items: { id?: string; kind: PendingAttachment["kind"]; name: string; size?: number | null; previewUrl?: string }[]; onRemove?: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="attach-chips" aria-label="Attached">
      {items.map((a, i) => (
        <span key={a.id ?? `${a.name}-${i}`} className="attach-chip" title={a.name}>
          {a.previewUrl ? <img src={a.previewUrl} alt="" className="attach-chip__thumb" /> : <span className="attach-chip__icon">{iconFor(a.kind)}</span>}
          <span className="attach-chip__name">{a.name}</span>
          {typeof a.size === "number" ? <span className="attach-chip__size">{sizeLabel(a.size)}</span> : null}
          {onRemove && a.id ? (
            <button type="button" className="attach-chip__remove" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a.id as string)}>
              <X size={11} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/** A sent message's attachments, from its journal entry (names only). */
export function sentAttachments(data: Record<string, unknown>): { kind: PendingAttachment["kind"]; name: string; size: number | null }[] {
  const raw = data.attachments;
  return Array.isArray(raw) ? (raw as { kind: PendingAttachment["kind"]; name: string; size: number | null }[]) : [];
}
