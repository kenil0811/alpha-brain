/**
 * A project's menu: the same items on the rail's project row (its ⋮ or a right-click) and on the
 * project page. Open and Hide from sidebar work; the edits need the core's project routes
 * (backend-requests.md §4), so they say they're coming soon.
 */
import { CornerUpLeft, Database, EyeOff, FileDown, FolderOpen, FolderPlus, Pencil, Shapes, Target, Trash2 } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator, useComingSoon } from "../ui";

export function ProjectMenuItems({ onOpen, onHide }: { onOpen?: () => void; onHide?: () => void }) {
  const soon = useComingSoon();
  return (
    <>
      {onOpen ? (
        <DropdownMenuItem onSelect={onOpen}>
          <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" /> Open
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => soon("Renaming a project")}>
        <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => soon("Changing a project's icon")}>
        <Shapes size={14} strokeWidth={1.75} aria-hidden="true" /> Change icon
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => soon("Editing a project's goal")}>
        <Target size={14} strokeWidth={1.75} aria-hidden="true" /> Edit goal
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => soon("Sub projects")}>
        <FolderPlus size={14} strokeWidth={1.75} aria-hidden="true" /> Add sub project
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => soon("Taking a project out of another")}>
        <CornerUpLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Take out
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => soon("Exporting a project")}>
        <FileDown size={14} strokeWidth={1.75} aria-hidden="true" /> Export…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => soon("Exporting a project with its data")}>
        <Database size={14} strokeWidth={1.75} aria-hidden="true" /> Export with data…
      </DropdownMenuItem>
      {onHide ? (
        <DropdownMenuItem onSelect={onHide}>
          <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" /> Hide from sidebar
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="ui-menu__item--danger" onSelect={() => soon("Deleting a project")}>
        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" /> Delete
      </DropdownMenuItem>
    </>
  );
}
