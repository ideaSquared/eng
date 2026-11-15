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
   - lets gh read your GitHub teams (`read:org`), which `eng ops` access is checked against;
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
esc to go back, q to quit, `/` to search. Each choice runs the real command in your terminal, then brings you back to the menu.

Press `/` to search: a line opens at the bottom, and typing filters every action in the menu by its path, for example
`Deploy › ads`, `Logs › creatrgrid`, `Ops › creatrgrid` or `Doctor`. A match needs every word you typed (any case). The
top 8 are shown live; up/down moves, enter runs the selected one, esc closes the search. While the search is open every
key (q and the digits too) goes to the search text; with it closed, 1-9 and q work as before.

### Staging or production, fixed per session

`eng` and `eng shell` start in **staging**, with no question. To work in production, start the session that way:

```bash
eng --production             # or: eng shell --production, or --env production
```

That shows a full-width red PRODUCTION warning and asks you to type `production`; anything else exits without doing
anything. `--env staging` is the default spelled out; no other `--env` value is accepted.

The environment is fixed for the whole session: there is no switching, so a stray command cannot hit the wrong one.
Deploy and Redeploy in the menu go product, then straight to `ship deploy <product> <session env>`; Logs runs
`idea logs <project> --env <session env>`. The menu border, title and a PRODUCTION (or staging) badge show where you
are, and the production colours are red. `eng` exports `ENG_ENV=staging|production` so ship, idea and `eng ops`
inherit it. ship still asks you to type the product name for a production deploy; eng never adds `--yes`.

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
eng [--production]           # open the eng app (staging unless --production; fixed for the session)
eng setup [--dir <folder>]   # sign in, install ship and idea, clone and install every repo
eng update                   # update ship, idea and eng; pull every clean repo on its default branch
eng doctor                   # check what is missing or out of date
eng theme                    # install the ideaSquared terminal skin and prompt
eng shell [--production]     # a prompt for short commands: deploy, logs, runs, ops
eng ops                      # list the products eng can run ops commands for, and their environments
eng ops <product>            # list a product's ops commands (a numbered picker in a terminal)
eng ops <product> <group> <name> [args...] [--env staging|production] [--yes] [--json-output]
eng ops find <words...>      # search every product's commands
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

`eng shell` (or Shell in the menu) opens a prompt that shows the session's environment, e.g. `◆ staging › `
(red in production), so you type short commands without the tool prefix:

| You type                          | It runs                                  |
| --------------------------------- | ---------------------------------------- |
| `deploy ads staging`              | `ship deploy ads staging`                |
| `redeploy ads staging`            | `ship deploy ads staging --redeploy`     |
| `rollback ads [env]`              | `ship rollback ads <env>`                |
| `status`                          | `ship status`                            |
| `logs ads`                        | `idea logs ads --env <current env>`      |
| `runs ads`                        | `idea runs ads --failed`                 |
| `ops <...>`                       | `eng ops <...>` (the rest of the line is passed through) |
| `find <words...>`                 | `eng ops find <words...>`                |
| `doctor`, `update`, `theme`       | the eng command of that name             |
| `ship <...>`, `idea <...>`        | that tool, exactly as typed              |
| `env`                             | show the session's environment (it cannot be switched) |
| `help`, `exit` / `quit` / Ctrl-D  | list commands, leave                     |
| `help <words...>`                 | only the help lines containing every word |

When a deploy, redeploy, rollback or logs line names no environment, the session's is used. If it names a different
one it is refused with a message, never overridden (`ship ...` and `idea ...` lines too, when they name the other
environment as a word or `--env`); `env production` says the session is fixed and how to restart
with `--production`. Tab completes commands and product
names, and the up arrow recalls earlier lines. An unknown word runs nothing. The shell never adds `--yes`: a
production deploy still asks you to type the product name.

## Ops

`eng ops` drives any product that exposes the [`@ideasquared/ops`](https://github.com/ideaSquared/agent-idea/tree/main/packages/ops)
contract: creatrgrid and ads (adopt-dont-shop) today, pairflix once it is deployed. All of them are plain HTTPS, so
there is nothing to set up beyond `gh auth login`. For ads, unlocks and history stay in adopt-dont-shop's `pnpm ops`.

```bash
eng ops creatrgrid                              # commands, grouped; in a terminal, pick one and answer its fields
eng ops creatrgrid accounts list                # a read runs and prints (accounts.list works too)
eng ops creatrgrid accounts resync acct_1       # a write previews, asks, then runs
eng ops creatrgrid accounts resync acct_1 --yes --env production --json-output
eng ops find resync                             # which command does that? searches every product at once
```

- It uses your own `gh auth token` (never printed). Access is membership of the product's GitHub team (`creatrgrid`,
  `pairflix`, `adoptdontshop`), so the token needs `read:org`: `gh auth refresh -s read:org`. If gh is not signed in,
  run `gh auth login` or `eng setup`.
- The environment is `ENG_ENV` (`staging` unless the session is production); `--env` overrides it. It is always shown
  in the header line, production in red.
- A write with a preview shows it first. Staging then asks `Run <id> on <product> staging? [y/N]` (`--yes` skips it).
  Production asks you to type the product name, and `--yes` never skips that. A write with no preview says so first.
- `--json-output` prints the raw JSON result on stdout (header and notes go to stderr).
- Product URLs are in `src/ops.ts`. Point one anywhere, with no release, via `ENG_OPS_URL_<PRODUCT>_<ENV>`, for
  example `ENG_OPS_URL_PAIRFLIX_STAGING=http://localhost:8787/api/ops`. A product with no URL is listed as not
  deployed yet.
- The Ops item in the eng menu picks a product, then opens the same picker.
- In the picker, type a number or a command id to choose it, or type words to filter the list. The matches keep their
  numbers from the whole list, so a number always means the same command; a single match is shown the same way (type
  its number to pick it). Enter on a filtered list shows the whole list again; enter on the whole list quits.

### Finding a command

`eng ops find <words...>` searches every product that has an ops URL for the current environment (the session's, or
`--env`; the session lock applies as for any ops command), fetching their catalogs in parallel. A command matches when
every word (any case) appears in its id, group, name, summary, or a field's name or description. Matches are printed
grouped by product (then by id) with the exact line to run, positional and required fields shown as `<name>`:

```
creatrgrid
  accounts.resync  write  Re-import posts
    eng ops creatrgrid accounts resync <accountId>
```

A product that cannot be reached or refuses you prints one muted line and does not stop the others. No match prints one
line and exits 0. creatrgrid has a `lookup id <id>` command (coming in a separate creatrgrid change) that finds any
creator, user, social account or content id, returning ids only, so `eng ops find lookup` will show it once it ships.

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
