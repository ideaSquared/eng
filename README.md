# eng

One command to set up an ideaSquared developer machine, and one to keep it up to date.

## New here? Start with this

macOS, Linux or WSL (bash or zsh):

```bash
curl -fsSL https://raw.githubusercontent.com/ideaSquared/eng/main/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ideaSquared/eng/main/install.ps1 | iex
```

The installer:

1. installs Node 22, pnpm, git and the GitHub CLI if they are missing (fnm or Homebrew or apt on macOS and Linux,
   winget on Windows);
2. installs the `eng` CLI;
3. runs `eng setup`, which:
   - signs you in to GitHub in your browser (`gh auth login`) and lets git use that sign-in;
   - installs the `ship` (deploys) and `idea` (sanitised logs) CLIs;
   - clones every ideaSquared repo you have access to into `~/ideasquared` and runs `pnpm install` in each;
   - finishes with `eng doctor`.

Open a new terminal afterwards so the PATH changes apply everywhere.

Before you start, ask for:

- membership of the ideaSquared GitHub organisation, with write access to the repos you will work on (`idea` and
  `ship` check it);
- the Discord server, where each product's `<project>-github` channel shows its deploys and alerts.

## The eng app

Run `eng` on its own to open a themed menu over everything: what is live in every product (`ship status`), deploys,
sanitised logs and failed runs (`idea`), and setup, update, doctor and the terminal theme. Arrow keys or 1-9 to pick,
esc to go back, q to quit. Each choice runs the real command in your terminal, then brings you back to the menu.

## The terminal skin

`eng theme` (setup offers it too) installs the ideaSquared look:

- **Windows Terminal:** an `ideaSquared` profile and colour scheme, added as a fragment, so your own settings are never
  edited. The profile opens straight into the eng app.
- **The prompt:** a themed [Starship](https://starship.rs) prompt showing the folder, branch, git status and Node version.
  It asks first, installs Starship if needed (winget or Homebrew), and adds two lines to your shell profile
  (PowerShell, bash or zsh). If you already use Starship, it asks before replacing your prompt.
- **cmd.exe:** cmd has no prompt hook, so `eng theme` installs [Clink](https://chrisant996.github.io/clink/) (winget),
  turns it on for cmd (`clink autorun install`, per user, no admin) and adds `ideasquared-starship.lua` to
  `%LOCALAPPDATA%\clink` to start the same prompt.

The palette lives in `src/theme.ts`.

## Commands

```bash
eng                          # open the eng app
eng setup [--dir <folder>]   # sign in, install ship and idea, clone and install every repo
eng update                   # update ship, idea and eng; pull every clean repo on its default branch
eng doctor                   # check what is missing or out of date
eng theme                    # install the ideaSquared terminal skin and prompt
eng shell                    # a prompt for short commands: deploy, logs, runs, ops
```

- Repos live in `~/ideasquared`. `eng setup --dir <folder>` uses another folder and remembers it
  (in `~/.config/eng/config.json`); `ENG_DIR` overrides both.
- `eng update` only pulls a repo that is on its default branch with no uncommitted changes. Anything else is
  skipped and listed, so it never touches work in progress.
- Docker is optional: only adopt-dont-shop needs it, so `eng doctor` warns rather than fails without it.
- Every time you run `eng`, it first checks GitHub (a quick `git ls-remote`) and updates eng, ship and idea if
  any is newer, then carries on. Offline, it skips the check. `ENG_NO_UPDATE=1` turns it off.
- Run `eng update` whenever you start work after a break, to pull your repos too. It is safe to run any time.

## The shell

`eng shell` (or Shell in the menu) opens a prompt that shows the current environment, e.g. `◆ staging › `, so you
type short commands without the tool prefix:

| You type                          | It runs                                  |
| --------------------------------- | ---------------------------------------- |
| `deploy ads staging`              | `ship deploy ads staging`                |
| `redeploy ads staging`            | `ship deploy ads staging --redeploy`     |
| `rollback ads [env]`              | `ship rollback ads <env>`                |
| `status`                          | `ship status`                            |
| `logs ads`                        | `idea logs ads --env <current env>`      |
| `runs ads`                        | `idea runs ads --failed`                 |
| `ops <...>`                       | `eng ops <...>` (the rest of the line is passed through) |
| `doctor`, `update`, `theme`       | the eng command of that name             |
| `ship <...>`, `idea <...>`        | that tool, exactly as typed              |
| `env staging` / `env production`  | switch the current environment (starts as staging) |
| `help`, `exit` / `quit` / Ctrl-D  | list commands, leave                     |

When a deploy, redeploy or rollback names no environment, the current one is used. Tab completes commands and product
names, and the up arrow recalls earlier lines. An unknown word runs nothing. The shell never adds `--yes`: a
production deploy still asks you to type the product name.

## Then

- Each repo's `CLAUDE.md` and README say how to run it.
- `ship status` shows what is live in every product; `idea logs <project>` shows its sanitised logs.

## Developing eng

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build        # the CLI, into dist/ (committed, so installing from GitHub needs no build)
```

Add a repo or a tool in `src/repos.ts` or `src/checks.ts`.
