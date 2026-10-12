/**
 * The icon a module wears (the UI rulebook §4 and §8: each module has its own icon). The person
 * picks one from a short curated set (the sidebar's "Change icon"); the choice is kept in the
 * world as `PREF.moduleIcons`, a `{ moduleId: iconName }` map, so the sidebar and Home's cards
 * show the same one. A module with no choice wears the icon its name and goal suggest, else the
 * first letter of its name, never a generic table (11 Oct, the owner). (9 Oct, the UI rulebook
 * phase 2.)
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

/** Words in a project's name or goal that suggest each icon. Plain, common words only: this is how
 *  a project looks, not what the platform knows about it (the person can change it any time). */
const WORDS: Record<string, string[]> = {
  briefcase: ["work", "job", "jobs", "career", "deal", "deals", "client", "clients", "advisory", "business", "sales", "consulting", "company"],
  checklist: ["task", "tasks", "todo", "todos", "checklist", "queue", "chores"],
  target: ["goal", "goals", "okr", "okrs", "habit", "habits", "plan", "plans"],
  idea: ["idea", "ideas", "brainstorm", "notes", "thoughts"],
  book: ["book", "books", "reading", "read", "library", "articles", "papers"],
  graduation: ["learn", "learning", "course", "courses", "study", "school", "class", "university"],
  code: ["code", "coding", "dev", "software", "repo", "engineering", "bugs"],
  package: ["order", "orders", "inventory", "shipment", "shipments", "stock", "supplies"],
  cart: ["shop", "shopping", "groceries", "grocery", "purchases", "wishlist"],
  wallet: ["money", "budget", "expenses", "expense", "spending", "finance", "finances", "bills", "invoices"],
  savings: ["savings", "investments", "investing", "portfolio", "retirement"],
  receipt: ["receipt", "receipts", "tax", "taxes"],
  house: ["home", "house", "household", "apartment", "rent", "renovation"],
  car: ["car", "cars", "vehicle", "commute"],
  plane: ["travel", "trip", "trips", "flights", "vacation", "holiday"],
  calendar: ["calendar", "schedule", "events", "meetings", "appointments"],
  mail: ["mail", "email", "emails", "newsletter", "newsletters"],
  inbox: ["inbox", "requests", "leads", "applications"],
  team: ["people", "contacts", "network", "team", "friends", "family", "crm", "hiring", "candidates"],
  heart: ["health", "medical", "doctor", "wellbeing", "sleep", "mood"],
  dumbbell: ["fitness", "gym", "workout", "workouts", "exercise", "running", "training"],
  food: ["food", "meal", "meals", "recipe", "recipes", "diet", "nutrition", "restaurants", "cooking"],
  leaf: ["garden", "plants", "nature", "outdoors"],
  music: ["music", "songs", "playlist", "playlists", "band"],
  camera: ["photo", "photos", "pictures", "video", "videos"],
  gift: ["gift", "gifts", "birthdays", "presents"],
  star: ["favourites", "favorites", "wishes"],
};

/** The icon a project's own words suggest: the name counts before the goal; null when nothing fits. */
export function suggestedIcon(name: string, goal?: string | null): string | null {
  for (const text of [name, goal ?? ""]) {
    const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
    for (const [icon, list] of Object.entries(WORDS)) if (list.some((w) => words.has(w))) return icon;
  }
  return null;
}

/** What a project wears: the person's pick, else what its name and goal suggest, else its first letter. */
export function projectIcon(picked: string | undefined, name: string, goal: string | null | undefined, size: number): ReactNode {
  const named = picked && MODULE_ICON_CHOICES.some((c) => c.name === picked) ? picked : suggestedIcon(name, goal);
  if (named) return iconNamed(named, size);
  return <span className="modletter" style={{ width: size, height: size }} aria-hidden="true">{[...name.trim()][0]?.toUpperCase() ?? "P"}</span>;
}

const NONE: Record<string, string> = {};

/** The icon of one choice, or the generic one when the name is not (or no longer) in the set. */
export function iconNamed(name: string | undefined, size: number): ReactNode {
  return (MODULE_ICON_CHOICES.find((c) => c.name === name) ?? MODULE_ICON_CHOICES[0]).draw(size);
}

/** The icon module `id` wears. Reads the shared preference, so a change in the sidebar shows
 *  here at once; it needs no client (the sidebar fetches the preference). */
export function ModuleGlyph({ id, name, goal, size = ICON }: { id: string; name: string; goal?: string | null; size?: number }) {
  const [icons] = usePreference<Record<string, string>>(null, PREF.moduleIcons, NONE);
  return <>{projectIcon(icons?.[id], name, goal, size)}</>;
}
