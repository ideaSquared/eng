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

## Commands

```bash
eng setup [--dir <folder>]   # sign in, install ship and idea, clone and install every repo
eng update                   # update ship, idea and eng; pull every clean repo on its default branch
eng doctor                   # check what is missing or out of date
```

- Repos live in `~/ideasquared`. `eng setup --dir <folder>` uses another folder and remembers it
  (in `~/.config/eng/config.json`); `ENG_DIR` overrides both.
- `eng update` only pulls a repo that is on its default branch with no uncommitted changes. Anything else is
  skipped and listed, so it never touches work in progress.
- Docker is optional: only adopt-dont-shop needs it, so `eng doctor` warns rather than fails without it.
- Run `eng update` whenever you start work after a break. It is safe to run any time.

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
