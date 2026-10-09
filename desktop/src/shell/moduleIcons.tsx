/**
 * The icon a module wears (the UI rulebook §4 and §8: each module has its own icon). The person
 * picks one from a short curated set (the sidebar's "Change icon"); the choice is kept in the
 * world as `PREF.moduleIcons`, a `{ moduleId: iconName }` map, so the sidebar and Home's cards
 * show the same one. A module with no choice, or an unknown name, wears the generic module icon.
 * (9 Oct, the UI rulebook phase 2.)
 */
import type { ReactNode } from "react";
import { PREF, usePreference } from "../core/preferences";
import {
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  CameraIcon,
  CarIcon,
  CartIcon,
  ChecklistIcon,
  CodeIcon,
  DumbbellIcon,
  FolderIcon,
  GiftIcon,
  GraduationIcon,
  HeartIcon,
  HouseIcon,
  ICON,
  IdeaIcon,
  InboxIcon,
  LeafIcon,
  MailIcon,
  ModuleIcon,
  MusicIcon,
  PackageIcon,
  PlaneIcon,
  ReceiptIcon,
  SavingsIcon,
  StarIcon,
  TargetIcon,
  TeamIcon,
  UtensilsIcon,
  WalletIcon,
  WrenchIcon,
} from "../ui/icons";

export interface ModuleIconChoice {
  /** What is saved. */
  name: string;
  /** What the picker says. */
  label: string;
  draw: (size: number) => ReactNode;
}

const choice = (name: string, label: string, Icon: typeof ModuleIcon): ModuleIconChoice => ({ name, label, draw: (size) => <Icon size={size} aria-hidden="true" /> });

/** The first one is the default. */
export const MODULE_ICON_CHOICES: ModuleIconChoice[] = [
  choice("table", "Table", ModuleIcon),
  choice("folder", "Folder", FolderIcon),
  choice("briefcase", "Work", BriefcaseIcon),
  choice("checklist", "Tasks", ChecklistIcon),
  choice("target", "Goals", TargetIcon),
  choice("idea", "Ideas", IdeaIcon),
  choice("book", "Reading", BookIcon),
  choice("graduation", "Learning", GraduationIcon),
  choice("code", "Code", CodeIcon),
  choice("wrench", "Projects", WrenchIcon),
  choice("package", "Orders", PackageIcon),
  choice("cart", "Shopping", CartIcon),
  choice("wallet", "Money", WalletIcon),
  choice("savings", "Savings", SavingsIcon),
  choice("receipt", "Receipts", ReceiptIcon),
  choice("house", "Home life", HouseIcon),
  choice("car", "Car", CarIcon),
  choice("plane", "Travel", PlaneIcon),
  choice("calendar", "Calendar", CalendarIcon),
  choice("mail", "Mail", MailIcon),
  choice("inbox", "Inbox", InboxIcon),
  choice("team", "People", TeamIcon),
  choice("heart", "Health", HeartIcon),
  choice("dumbbell", "Fitness", DumbbellIcon),
  choice("food", "Food", UtensilsIcon),
  choice("leaf", "Nature", LeafIcon),
  choice("music", "Music", MusicIcon),
  choice("camera", "Photos", CameraIcon),
  choice("gift", "Gifts", GiftIcon),
  choice("star", "Favourites", StarIcon),
];

const NONE: Record<string, string> = {};

/** The icon of one choice, or the generic one when the name is not (or no longer) in the set. */
export function iconNamed(name: string | undefined, size: number): ReactNode {
  return (MODULE_ICON_CHOICES.find((c) => c.name === name) ?? MODULE_ICON_CHOICES[0]).draw(size);
}

/** The icon module `id` wears. Reads the shared preference, so a change in the sidebar shows
 *  here at once; it needs no client (the sidebar fetches the preference). */
export function ModuleGlyph({ id, size = ICON }: { id: string; size?: number }) {
  const [icons] = usePreference<Record<string, string>>(null, PREF.moduleIcons, NONE);
  return <>{iconNamed(icons?.[id], size)}</>;
}
