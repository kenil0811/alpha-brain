/**
 * The icon a module wears, the same in the sidebar, on Home's card and on its page (13 Oct, Q42
 * section 5; the feature from pull request #5). By default it is picked from the module's name:
 * a plain, common word in the name suggests an icon ("Job Search" a briefcase, "Nutrition" a
 * plate), else main's table icon. Kenil (13 Oct): "module icons should be auto picked based on
 * name by default". The person can pick another from the sidebar's right-click menu; the pick is
 * kept in the world (`module_icons`, `{ moduleId: iconName }`). This is how a module looks, not
 * anything Alpha knows or does about it.
 */
import type { ReactNode } from "react";
import type { Client } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Car,
  Code,
  Dumbbell,
  FileText,
  Folder,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  House,
  Inbox,
  Leaf,
  Lightbulb,
  ListChecks,
  Mail,
  ModuleIcon,
  Music,
  Newspaper,
  Package,
  PeopleIcon,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingCart,
  Star,
  Target,
  Utensils,
  Wallet,
  Wrench,
} from "../ui/icons";

type Glyph = typeof ModuleIcon;

export interface ModuleIconChoice {
  /** What is kept. */
  name: string;
  /** What the menu says. */
  label: string;
  Icon: Glyph;
  /** Words in a module's name that suggest it, singular (a plural matches too). */
  words: string[];
}

/** The icons a module can wear, in the menu's order; the first is the default. */
export const MODULE_ICONS: ModuleIconChoice[] = [
  { name: "table", label: "Table", Icon: ModuleIcon, words: [] },
  { name: "briefcase", label: "Work", Icon: Briefcase, words: ["work", "job", "career", "deal", "client", "advisory", "business", "sale", "consulting", "office", "pipeline"] },
  { name: "people", label: "People", Icon: PeopleIcon, words: ["people", "contact", "network", "team", "friend", "family", "crm", "hiring", "candidate", "connection"] },
  { name: "building", label: "Companies", Icon: Building2, words: ["company", "companies", "property", "properties", "site", "real", "estate", "listing", "acquisition"] },
  { name: "checklist", label: "Tasks", Icon: ListChecks, words: ["task", "todo", "checklist", "chore", "errand"] },
  { name: "target", label: "Goals", Icon: Target, words: ["goal", "okr", "habit", "plan", "scorecard", "score"] },
  { name: "notes", label: "Notes", Icon: FileText, words: ["note", "journal", "diary", "writing", "doc", "document"] },
  { name: "idea", label: "Ideas", Icon: Lightbulb, words: ["idea", "brainstorm", "thought"] },
  { name: "book", label: "Reading", Icon: BookOpen, words: ["book", "reading", "library", "article", "paper"] },
  { name: "graduation", label: "Learning", Icon: GraduationCap, words: ["learn", "learning", "course", "study", "school", "class", "university"] },
  { name: "code", label: "Code", Icon: Code, words: ["code", "coding", "dev", "software", "repo", "engineering", "bug"] },
  { name: "wrench", label: "Projects", Icon: Wrench, words: ["project", "repair", "fix", "build", "renovation"] },
  { name: "package", label: "Orders", Icon: Package, words: ["order", "inventory", "shipment", "stock", "supply", "supplies", "delivery", "deliveries"] },
  { name: "cart", label: "Shopping", Icon: ShoppingCart, words: ["shop", "shopping", "grocery", "groceries", "purchase", "wishlist"] },
  { name: "wallet", label: "Money", Icon: Wallet, words: ["money", "budget", "expense", "spending", "finance", "bill", "invoice", "account", "accounting"] },
  { name: "savings", label: "Savings", Icon: PiggyBank, words: ["saving", "investment", "investing", "portfolio", "retirement"] },
  { name: "receipt", label: "Receipts", Icon: Receipt, words: ["receipt", "tax", "taxes"] },
  { name: "house", label: "Home life", Icon: House, words: ["home", "house", "household", "apartment", "rent"] },
  { name: "car", label: "Car", Icon: Car, words: ["car", "vehicle", "commute", "wash", "auto"] },
  { name: "plane", label: "Travel", Icon: Plane, words: ["travel", "trip", "flight", "vacation", "holiday"] },
  { name: "calendar", label: "Calendar", Icon: Calendar, words: ["calendar", "schedule", "event", "meeting", "appointment"] },
  { name: "mail", label: "Mail", Icon: Mail, words: ["mail", "email", "newsletter"] },
  { name: "inbox", label: "Inbox", Icon: Inbox, words: ["inbox", "request", "lead", "application"] },
  { name: "news", label: "News", Icon: Newspaper, words: ["news", "feed", "digest", "update"] },
  { name: "globe", label: "Web", Icon: Globe, words: ["web", "website", "research", "market"] },
  { name: "heart", label: "Health", Icon: Heart, words: ["health", "medical", "doctor", "wellbeing", "sleep", "mood"] },
  { name: "dumbbell", label: "Fitness", Icon: Dumbbell, words: ["fitness", "gym", "workout", "exercise", "running", "training"] },
  { name: "food", label: "Food", Icon: Utensils, words: ["food", "meal", "recipe", "diet", "nutrition", "restaurant", "cooking", "calorie"] },
  { name: "leaf", label: "Nature", Icon: Leaf, words: ["garden", "plant", "nature", "outdoor"] },
  { name: "music", label: "Music", Icon: Music, words: ["music", "song", "playlist", "band"] },
  { name: "camera", label: "Photos", Icon: Camera, words: ["photo", "picture", "video"] },
  { name: "gift", label: "Gifts", Icon: Gift, words: ["gift", "birthday", "present"] },
  { name: "folder", label: "Folder", Icon: Folder, words: ["folder", "archive", "misc"] },
  { name: "star", label: "Favourites", Icon: Star, words: ["favourite", "favorite", "wish"] },
];

/** The icon a module's name suggests, or null when no word in it does. */
export function iconFromName(name: string): string | null {
  // the first word of the name that suggests anything decides: "Car Wash Site" is a car
  for (const w of name.toLowerCase().match(/[a-z]+/g) ?? []) {
    const hit = MODULE_ICONS.find((c) => c.words.some((k) => w === k || w === `${k}s` || w === `${k}es`));
    if (hit) return hit.name;
  }
  return null;
}

/** What module `id` wears: the person's pick, else what its name suggests, else the table. */
export function iconFor(icons: Record<string, string>, id: string, name: string): ModuleIconChoice {
  const picked = MODULE_ICONS.find((c) => c.name === icons[id]);
  return picked ?? MODULE_ICONS.find((c) => c.name === iconFromName(name)) ?? MODULE_ICONS[0];
}

const NO_ICONS: Record<string, string> = {};

/** The person's picks, read once for the window. */
export function useModuleIcons(client: Client | null) {
  const [icons, setIcons] = usePreference<Record<string, string>>(client, PREF.moduleIcons, NO_ICONS);
  return [icons && typeof icons === "object" ? icons : NO_ICONS, setIcons] as const;
}

/** A module's icon wherever the window shows a module. */
export function ModuleGlyph({ client, id, name, size }: { client: Client | null; id: string; name: string; size?: number }): ReactNode {
  const [icons] = useModuleIcons(client);
  const { Icon } = iconFor(icons, id, name);
  return <Icon size={size} aria-hidden="true" />;
}
