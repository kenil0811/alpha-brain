import {
  BookOpen,
  Boxes,
  Briefcase,
  Calendar,
  ChartLine,
  Code,
  Dumbbell,
  Folder,
  GraduationCap,
  HeartPulse,
  House,
  ListChecks,
  Mail,
  Megaphone,
  NotebookPen,
  Plane,
  ShoppingCart,
  Sparkles,
  StickyNote,
  Target,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ModuleCard } from "../core/client";

/** The icons a project may wear: the same list Core accepts (core/alpha/world/modules.py ICONS). */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  boxes: Boxes,
  folder: Folder,
  briefcase: Briefcase,
  "notebook-pen": NotebookPen,
  calendar: Calendar,
  users: Users,
  "chart-line": ChartLine,
  mail: Mail,
  "list-checks": ListChecks,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  wallet: Wallet,
  "shopping-cart": ShoppingCart,
  plane: Plane,
  house: House,
  code: Code,
  megaphone: Megaphone,
  "book-open": BookOpen,
  sparkles: Sparkles,
  "sticky-note": StickyNote,
  target: Target,
  utensils: Utensils,
  dumbbell: Dumbbell,
};

/** The icon the person picked, else one guessed from the project's name and goal. */
export function projectIcon(m: Pick<ModuleCard, "name" | "goal" | "icon">): LucideIcon {
  if (m.icon && PROJECT_ICONS[m.icon]) return PROJECT_ICONS[m.icon];
  const text = `${m.name} ${m.goal ?? ""}`.toLowerCase();
  if (/food|meal|calorie|diet|eat/.test(text)) return Utensils;
  if (/workout|gym|fitness|exercise|run/.test(text)) return Dumbbell;
  if (/job|opening|career|applic|hiring/.test(text)) return Briefcase;
  if (/book|read/.test(text)) return BookOpen;
  if (/money|spend|expense|budget|receipt/.test(text)) return Wallet;
  if (/task|todo|plan/.test(text)) return ListChecks;
  if (/people|contact|network/.test(text)) return Users;
  return Boxes;
}
