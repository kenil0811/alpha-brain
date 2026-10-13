# Dell Disability — clickable demo

What the finished case platform would look like, in Alpha Brain's visual language. Every client,
claim number, amount and date is invented; nothing is saved (reload resets it) and no model is
called — Alpha's replies are scripted.

```bash
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
cd dell/demo && pnpm install --ignore-workspace && pnpm dev   # http://localhost:5190
```

## A five-minute walk-through

1. **Home** — what needs you today, as Maria Alvarez (legal assistant). The workspace menu (top left) switches role: attorney, owner, intake, finance.
2. **Ongoing benefits › Requests › “Updated APS, claimant statement and authorization”** (Angela Morrison, Unum) — one insurer email split into three obligations, one message to the client.
3. **Forms and APS** — the APS draft with every answer's source.
4. **Workspace menu › Open the client portal** — what Angela sees: one assignment, a “what changed?” questionnaire, upload, submission history.
5. **Ongoing benefits › Submissions** — Sent, Delivery confirmed and Insurer acknowledged as three separate statuses.
6. **Appeals**, **Intake**, **Finance**, **Call reviews**, **Task manager** — the rest of the firm.
7. **Intelligence** — agents, automations, connections and what Alpha holds; **Governance** at the foot of every project page — what Alpha may and may not do.

## Layout

`src/kit` controls · `src/views` the data view, record and project pages · `src/shell` frame pages ·
`src/projects/*.tsx` one file per module (data, record sections, agents, rules) · `src/portal` the
client portal · `src/data` store, routes, Home aggregates. Palette and sizes copy
`desktop/src/styles/app.css`; keep them in step.
