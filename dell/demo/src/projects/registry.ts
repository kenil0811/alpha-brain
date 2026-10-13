import type { Project } from "../data/types";
import type { Extras } from "./extras";
import { appeals, appealsExtras } from "./appeals";
import { benefits, benefitsExtras } from "./benefits";
import { calls, callsExtras } from "./calls";
import { finance, financeExtras } from "./finance";
import { forms, formsExtras } from "./forms";
import { intake, intakeExtras } from "./intake";
import { medical, medicalExtras } from "./medical";
import { network, networkExtras } from "./network";
import { tasks, tasksExtras } from "./tasks";

/** Sidebar order. Children (parent set) fold out under their parent. */
export const PROJECTS: Project[] = [tasks, intake, network, benefits, medical, forms, appeals, finance, calls];

export const EXTRAS: Record<string, Extras> = {
  tasks: tasksExtras, intake: intakeExtras, network: networkExtras, benefits: benefitsExtras, medical: medicalExtras,
  forms: formsExtras, appeals: appealsExtras, finance: financeExtras, calls: callsExtras,
};
