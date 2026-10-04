/**
 * First steps, a pop-up (Bridge's OnboardingDialog): three screens of questions from
 * shell/onboarding, then where to begin. Opens on its own until it's finished or skipped (the
 * `onboarding` preference), from Home's First steps, and from Settings → About.
 *
 * Saving: the answers become one note about the person (NOTE_TITLE, which the interviewer
 * reads), the companion's name a preference, and the raw answers the `onboarding` preference
 * with `done`. Naming an animal changes the companion's look (avatar/look). Each "where to
 * begin" pick is offered as a request drafted into Zazoo, never sent: on this core Zazoo sets up
 * a project from what the person says.
 */
import { useEffect, useState } from "react";
import { kindLabel, readLook, saveLook } from "../avatar/look";
import type { Client } from "../core/client";
import { Dialog, DialogContent, InfoTip, Input } from "../ui";
import { Button } from "../ui/Button";
import { ZazooIcon } from "../ui/ZazooIcon";
import { answered, type Answers, back, beginRequests, commit, GROUPS, nextGroup, NOTE_TITLE, noteBody, type Question, ready, speciesFromText, TOTAL } from "./onboarding";

export const OPEN_ONBOARDING = "alpha:open-onboarding";
export const ONBOARDING_PREF = "onboarding";
export const NAME_PREF = "companion_name";

export interface OnboardingState {
  done?: boolean;
  skipped?: boolean;
  answers?: Answers;
}

/** The note first, `done` last, so a failed save leaves first steps to open again. */
export async function saveFirstSteps(client: Client, answers: Answers): Promise<void> {
  await client.writeNote("person", NOTE_TITLE, noteBody(answers), "What the person said in first steps.");
  const name = (answers.companion_name as string | undefined)?.trim();
  if (name) await client.setPreference(NAME_PREF, name);
  await client.setPreference(ONBOARDING_PREF, { done: true, answers } satisfies OnboardingState);
}

export function Onboarding({ client, open, onClose, onAsk }: { client: Client; open: boolean; onClose: () => void; onAsk: (text: string) => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [drafts, setDrafts] = useState<Answers>({});
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");
  const [wasDone, setWasDone] = useState(false);

  // Re-entering starts at the first screen with the last answers filled in.
  useEffect(() => {
    if (!open) return;
    setAnswers({});
    setDrafts({});
    setFinished(false);
    setError(null);
    // Anything already typed wins over the saved answers.
    client
      .preference(ONBOARDING_PREF)
      .then((p) => {
        const saved = p.value as OnboardingState | null;
        setWasDone(!!saved?.done);
        setDrafts((d) => ({ ...saved?.answers, ...d }));
      })
      .catch(() => undefined);
    client
      .preference(NAME_PREF)
      .then((p) => setSavedName(typeof p.value === "string" ? p.value : ""))
      .catch(() => undefined);
  }, [open, client]);

  const group = nextGroup(answers);
  const name = (answers.companion_name as string | undefined) || savedName || "Zazoo";
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const next = async () => {
    if (!group) return;
    const all = { ...answers, ...commit(group.questions, drafts) };
    // Naming an animal it can be gives the companion that look now, so the face above shows it.
    const species = group.index === 0 ? speciesFromText(all.companion_name as string) : undefined;
    if (species) saveLook({ ...readLook(), species: species.id, body: species.body });
    if (nextGroup(all)) return setAnswers(all);
    setBusy(true);
    setError(null);
    try {
      await saveFirstSteps(client, all);
      setAnswers(all);
      setFinished(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const goBack = () => {
    const index = finished ? GROUPS.length : (group?.index ?? 0);
    const step = back(answers, index);
    setAnswers(step.answers);
    setDrafts((d) => ({ ...d, ...step.drafts }));
    setFinished(false);
  };
  // Skipping marks first steps done so they don't open again; on a re-entry it only closes.
  const skip = () => {
    if (wasDone) return onClose();
    setBusy(true);
    client
      .setPreference(ONBOARDING_PREF, { done: true, skipped: true, answers: { ...answers } } satisfies OnboardingState)
      .then(onClose, fail)
      .finally(() => setBusy(false));
  };

  const progress = finished ? TOTAL : answered(answers);
  const requests = finished ? beginRequests(answers) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent title="First steps">
        <div className="onboard">
          <div className="onboard__intro">
            <ZazooIcon size={44} label={name} />
            <div className="onboard__who">
              <b>{finished ? `${name} is ready.` : `I'm ${name}.`}</b>
              <span className="muted">{finished ? "Where to begin" : `${group?.title}, ${(group?.index ?? 0) + 1} of ${GROUPS.length}`}</span>
              <div className="onboard__bar" role="progressbar" aria-label="First steps" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={progress}>
                <div style={{ width: `${(progress / TOTAL) * 100}%` }} />
              </div>
            </div>
          </div>
          {group && !finished ? (
            group.questions.map((q) => <Field key={q.id} q={q} value={drafts[q.id]} onChange={(v) => setDrafts((d) => ({ ...d, [q.id]: v }))} />)
          ) : requests.length ? (
            <ul className="onboard__begin">
              {requests.map((r) => (
                <li key={r.id}>
                  <span>{r.label}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    title={r.text}
                    onClick={() => {
                      onAsk(r.text);
                      onClose();
                    }}
                  >
                    Start in Zazoo
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Ask {name} for anything, any time.</p>
          )}
          {error ? (
            <p className="notice" role="alert">
              {error}
            </p>
          ) : null}
          <div className="onboard__foot">
            {finished ? null : (
              <Button variant="ghost" size="sm" disabled={busy} onClick={skip}>
                Skip for now
              </Button>
            )}
            <span className="onboard__gap" />
            {finished || (group?.index ?? 0) > 0 ? (
              <Button variant="outline" disabled={busy} onClick={goBack}>
                Back
              </Button>
            ) : null}
            {finished ? (
              <Button onClick={onClose}>Done</Button>
            ) : (
              <Button disabled={busy || !group || !ready(group.questions, drafts)} onClick={() => void next()}>
                {group?.index === GROUPS.length - 1 ? "Finish" : "Continue"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ q, value, onChange }: { q: Question; value: Answers[string]; onChange: (v: string | string[]) => void }) {
  const picked = Array.isArray(value) ? value : [];
  const toggle = (v: string) => onChange(picked.includes(v) ? picked.filter((x) => x !== v) : q.max && picked.length >= q.max ? picked : [...picked, v]);
  const text = typeof value === "string" ? value : "";
  const species = q.id === "companion_name" ? speciesFromText(text) : undefined;
  return (
    <div className="onboard__q" role="group" aria-label={q.prompt}>
      <div className="onboard__prompt">
        <b>{q.prompt}</b>
        <InfoTip content={q.why} label="Why this is asked" />
      </div>
      {q.kind === "text" ? (
        <>
          <Input aria-label={q.prompt} placeholder={q.placeholder} maxLength={240} value={text} onChange={(e) => onChange(e.target.value)} />
          {q.id === "companion_name" ? (
            // Honest about the look: only the animals it can be drawn as change it.
            <span className="muted onboard__look">{species ? `Will look like a ${kindLabel(species).toLowerCase()}.` : "No animal named, so it keeps its look."}</span>
          ) : null}
        </>
      ) : (
        <div className="chips">
          {q.options?.map((opt) => {
            const on = q.kind === "multi" ? picked.includes(opt.value) : value === opt.value;
            const full = q.kind === "multi" && !on && !!q.max && picked.length >= q.max;
            return (
              <button key={opt.value} type="button" className="chip" aria-pressed={on} disabled={full} onClick={() => (q.kind === "multi" ? toggle(opt.value) : onChange(on ? "" : opt.value))}>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
