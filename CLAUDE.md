# CLAUDE.md

eng sets up and updates an ideaSquared developer machine: the `install.sh` and `install.ps1` installers and the
`eng` CLI (`setup`, `update`, `doctor`). See README.md.

## Working rules

- TypeScript strict, no `any`. Keep the logic pure (`src/checks.ts`, `src/repos.ts`) and tested; `src/cli.ts` only
  wires it to the shell. Run `pnpm typecheck` and `pnpm test` before you call a change done.
- Run `pnpm build` and commit `dist/`: it is what `pnpm add -g github:ideaSquared/eng` installs, and CI fails if it
  differs from `src/`.
- The installers must stay safe to re-run: install only what is missing, never overwrite a user's setup.
- `eng update` must never touch work in progress: it pulls only a clean checkout of the default branch.
- Conventional commits (`feat:`, `fix:`, `chore:` ...), one change per PR, tests with behaviour changes.

## Logging

- eng's output is CLI output for people, so it uses the terminal (`console`), not `@ideasquared/log`.
- It must never print secrets (tokens) or personal data.
- Load the `logging` skill (`.claude/skills/logging/SKILL.md`) before adding output lines.
