# 18 October 2026 — harness slice 6, the spike: the SDK's files and shell under the sandbox

Before any code of slice 6 (`../design/harness-slice-6-proposal.md`; Kenil: "why no shell?",
then yes to the shell under the sandbox, spike first). Two scripts in `spikes/2026-10-18-slice6/`,
run on Kenil's Mac with Haiku through the SDK (0.2.168, Claude Code 2.1.301), nothing of
Alpha's in them. A scratch home with `modules/m_test/` as the turn's `cwd`, a granted folder
passed as `add_dirs`, and a folder outside both.

## The six questions, answered

1. **A shell write inside the module's directory** (`echo inside > inside.txt`): works.
2. **A shell write outside it** (`echo out > <outside>/x.txt`): "operation not permitted", the
   file is not there. The sandbox (`sandbox: {enabled, autoAllowBashIfSandboxed,
   allowUnsandboxedCommands: false}`) confines writes to `cwd` and `add_dirs` at the OS.
3. **A shell read outside** (`head -1 /etc/hosts` by a relative path): refused the same way; a
   shell read of the granted folder (`cat <granted>/note.txt`): works. So the shell reads and
   writes only where the turn was pointed, not the whole Mac.
4. **The network from the shell** (`curl https://example.com`): the sandbox asks the
   permission callback as a tool named `SandboxNetworkAccess` with the host; allowed, the page
   comes back; denied, `curl: (56) CONNECT tunnel failed, response 403` and a sandbox
   violation in the tool result. The network is a gate in code, host by host.
5. **The Read tool on a granted file**: works; with `Read` in `allowed_tools` the callback is
   never asked (the SDK warns that the allow shadows it). Kept out of `allowed_tools`, every
   `Read`, `Write` and `Edit` reaches the callback with its `file_path`, and the callback
   allowed the granted folder and refused `/etc/hosts` in words.
6. **The Write tool outside the module**: refused by the callback in words, nothing written.
   One slip of the spike's own: a write *inside* the module was refused too, because the model
   used the real path (`/private/var/…`) and the check compared it with the symlinked one
   (`/var/…`); the roots must be resolved as the paths are. The mechanism holds.

## What slice 6 builds on this

- A turn's options: `cwd` the module's directory (Home's turns: the home's own `modules/`
  parent is not writable; they get a scratch directory), `add_dirs` the granted folders,
  `allowed_tools` adds `Bash`, `Glob`, `Grep`; `Read`, `Write`, `Edit` go through the callback,
  which allows reads in the granted folders (or anywhere when the whole-Mac switch is on) and
  writes inside the module's directory only, with resolved paths; `SandboxNetworkAccess` is
  denied always (what leaves the world goes through `act_outward`).
- The sandbox settings above, always on; `allowUnsandboxedCommands: false` so nothing bypasses
  it. Commands excluded from the sandbox: none.
- The pre-pack names the granted folders and the module's directory, so the model knows where
  it may read and write before it tries.
