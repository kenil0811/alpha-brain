/**
 * The composer's "+" menu, laid out as on feat/bridge-parity: add files, images, a folder or
 * audio to the next message, and Advanced → Model (which model this chat uses) and Advanced →
 * Access (how much Zazoo may do here before it asks). The core takes no attachments and keeps
 * no model or access per chat yet (backend-requests.md §2, and the host's pickers in §9), so
 * each shows its default and using it says it's coming soon.
 */
import { type ClipboardEvent, type DragEvent } from "react";
import { Check, File, FileAudio, FolderClosed, Image as ImageIcon, Plus, Settings2 } from "lucide-react";
import { CLAUDE_MODELS } from "../shell/models";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, IconButton, useComingSoon } from "../ui";

const ACCESS_MODES = [
  { value: "ask", title: "Ask for approval", hint: "Always ask to edit external files and use the internet" },
  { value: "approve_for_me", title: "Approve for me", hint: "Only ask for actions detected as potentially unsafe" },
  { value: "full", title: "Full access", hint: "Unrestricted access to the internet and any file on your computer" },
];

const ticked = (on: boolean) => (on ? <Check size={14} aria-hidden="true" className="ui-menu__check" /> : <span className="ui-menu__check" />);

export function AttachMenu() {
  const soon = useComingSoon();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label="Add files, images, a folder or audio" title="Add files, images, a folder or audio" size="sm" className="composer__plus">
          <Plus size={14} aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => soon("Adding files")}>
          <File size={14} aria-hidden="true" /> Add files
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => soon("Adding images")}>
          <ImageIcon size={14} aria-hidden="true" /> Add images
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => soon("Adding a folder")}>
          <FolderClosed size={14} aria-hidden="true" /> Add a folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => soon("Adding audio")}>
          <FileAudio size={14} aria-hidden="true" /> Add audio
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Settings2 size={14} aria-hidden="true" />
            <span className="ui-menu__body">Advanced</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            {/* Every chat goes to Claude Code with its own default model today. */}
            <DropdownMenuItem onSelect={() => soon("Choosing a model for this chat")}>
              {ticked(true)}
              <span className="ui-menu__body truncate">Claude Code (default)</span>
            </DropdownMenuItem>
            {CLAUDE_MODELS.map((m) => (
              <DropdownMenuItem key={m.value} onSelect={() => soon("Choosing a model for this chat")}>
                {ticked(false)}
                <span className="ui-menu__body truncate">{m.label}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Access</DropdownMenuLabel>
            {ACCESS_MODES.map((m) => (
              <DropdownMenuItem key={m.value} className={m.value === "full" ? "ui-menu__item--warning" : ""} onSelect={() => soon("Choosing access for this chat")}>
                {ticked(m.value === "ask")}
                <span className="ui-menu__body">
                  {m.title}
                  <span className="ui-menu__sub-label">{m.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** True when a drop or paste carries files (not just text). */
export function carriesFiles(data: DataTransfer | null): boolean {
  return Boolean(data && (data.files.length || Array.from(data.types).includes("Files")));
}

/** A file dropped or pasted onto the composer says attaching is coming soon instead of nothing
 *  happening (or the webview opening it). Text pastes and drops work as before. */
export function useComposerFiles() {
  const soon = useComingSoon();
  return {
    onDragOver: (e: DragEvent) => {
      if (carriesFiles(e.dataTransfer)) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      e.preventDefault();
      soon("Adding files");
    },
    onPaste: (e: ClipboardEvent) => {
      if (!e.clipboardData.files.length) return;
      e.preventDefault();
      soon("Adding files");
    },
  };
}
