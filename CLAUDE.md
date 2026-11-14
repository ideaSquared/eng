# CLAUDE.md

eng sets up and updates an ideaSquared developer machine: the `install.sh` and `install.ps1` installers and the
`eng` CLI: a themed Ink app when run on its own, plus `setup`, `update`, `doctor` and `theme`. See README.md.

## Working rules

- TypeScript strict, no `any`. Keep the logic pure (`src/checks.ts`, `src/repos.ts`, `src/menu.ts`, `src/theme.ts`) and tested;
  `src/cli.ts` and `src/skin.ts` only wire it to the shell. The app (`src/app.tsx`) only chooses an action and is
  tested with ink-testing-library.
- Colours come from `PALETTE` in `src/theme.ts`; never hard-code another. Run `pnpm typecheck` and `pnpm test` before you call a change done.
- Run `pnpm build` and commit `dist/`: it is what `pnpm add -g github:ideaSquared/eng` installs, and CI fails if it
  differs from `src/`.
- The installers must stay safe to re-run: install only what is missing, never overwrite a user's setup.
- `eng update` must never touch work in progress: it pulls only a clean checkout of the default branch.
- Conventional commits (`feat:`, `fix:`, `chore:` ...), one change per PR, tests with behaviour changes.

## Logging

- eng's output is CLI output for people, so it uses the terminal (`console`), not `@ideasquared/log`.
- It must never print secrets (tokens) or personal data.
- Load the `logging` skill (`.claude/skills/logging/SKILL.md`) before adding output lines.
