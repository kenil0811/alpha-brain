import type { Activity, Due, Proposal } from "../data/types";

/** What a project adds to Home and the assistant: proposals (Needs you), due items, activity,
 *  and the scripted opening of its conversation. */
export interface Turn { who: "you" | "alpha"; text?: string; source?: string; proposal?: string }

export interface Extras {
  proposals: Proposal[];
  due: Due[];
  activity: Activity[];
  conversation: Turn[];
}
