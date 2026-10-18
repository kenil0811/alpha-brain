# 18 October 2026 — harness slice 6, the core: the model's own files and shell, Scout's pick as a question

The core half of slice 6 (`../design/harness-slice-6-proposal.md`; Kenil: "why no shell?",
then yes to the shell under the sandbox; both the folders and the whole-Mac switch; Scout's
costly pick as a question). The spike before it: `2026-10-18-harness-slice6-spike.md`.

## What was built

- **Grants** (`world/grants.py`): the folders the model may read are the folders the person
  connected (the `files` connector's watched folders, resolved), plus the module's own
  directory, plus the whole Mac when the person switched that on (`meta grant_whole_mac`;
  `GET /api/folders`, `POST /api/folders/whole_mac`, journaled). Writes: the module's own
  directory only (`modules/<id>/`; a turn with no module gets `sessions/scratch/`).
- **The turn's options** (`runtime/engine.py`): `cwd` the module's directory, `add_dirs` the
  granted folders, `allowed_tools` adds `Bash`, `Glob` and `Grep`; `Read`, `Write` and `Edit`
  are left to the permission callback (an allow would shadow it), which allows reads inside
  the granted places (or anywhere with the whole Mac on) and writes inside the module's
  directory, with resolved paths, and refuses the rest in words; `SandboxNetworkAccess`, the
  sandbox's question for the shell's network, is always refused ("anything that leaves the
  person's world goes through act_outward and their yes"). The sandbox is on for every turn
  (`enabled`, `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands: false`): the OS confines
  the shell's writes and reads to `cwd` and `add_dirs`.
- **The pre-pack** says where (WHAT ALPHA CAN REACH: the model's own directory, the folders it
  may read or the whole Mac, the shell's lack of network); the turn prompt's hands line names
  the SDK's tools in a clause.
- **Scout's sure and costly pick is a question card** ("<title>: <what>", Take · Not now),
  beside its proposal on Home's picks; Take decides the pick and starts the action's turn,
  Not now decides it (`api/home.py`); Needs you lists no proposal of Scout's any more.

## Proven by tests

`test_engine`: Read and Grep allowed in the granted folder and the module's directory, refused
at `/etc/hosts` with the words; Write allowed inside the module's directory, refused in the
person's folder; the network refused naming `act_outward`; the whole Mac on: reads anywhere,
writes still inside; the options carry Bash, Glob, Grep but not Read, Write, Edit, the sandbox
on and unbypassable, the folders as `add_dirs`, the module's directory as `cwd`. `test_api`:
the folders route and the switch. `test_scout`: the costly pick as a question card with its
two options and no proposal in Needs you. 323 core tests; ruff and mypy clean.

## Ran for real

`files_in_a_turn` (fresh world, Sonnet): a notes folder connected with two files, "what do
my notes say about the car wash sites?" answered from the file, "save a file called hello.txt
on my Desktop" refused in words: see the report named in STATE.
