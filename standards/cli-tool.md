# CLI tool standards

Applies to repos of type `cli-tool` (see [README.md](README.md)), on top of [common.md](common.md): Node CLIs that
people install from GitHub (`pnpm add -g github:ideaSquared/<repo>`) with a committed `dist/`.

## Package and entry point

**CLI-01** · MUST · `package.json` has `"type": "module"` and a `bin` entry mapping each command name to a file under
`dist/` (e.g. `"ship": "dist/cli.js"`), and that file starts with `#!/usr/bin/env node`. [L1]
Check: `jq -r '.type, (.bin | to_entries[].value)' package.json`; `head -1 <bin file>` is the shebang.

**CLI-02** · MUST · `package.json` `files` includes `dist`, and everything the built CLI imports at runtime is in
`dependencies` (not `devDependencies`), so a GitHub install runs without a build. [L1]
Check: `jq -e '.files | index("dist")' package.json`; CI's install test (CLI-05) passes.

## Committed dist

**CLI-03** · MUST · `dist/` is committed and CI rebuilds it and fails when it differs from the committed copy. [L2]
Check: `ci.yml` runs `pnpm build` then `git diff --exit-code -- dist` (plus any other committed build output).

**CLI-04** · MUST · `dist/` is produced only by `pnpm build` from `src/`; nobody edits it by hand, and CODEOWNERS covers
it.
Check: `grep -E '^/dist/' .github/CODEOWNERS`; CLI-03 passes.

## Install path

**CLI-05** · MUST · The README gives the install command `pnpm add -g github:ideaSquared/<repo>` (optionally
`#<tag>`), and CI proves it works by packing the repo and running the installed command's `--version`.
Check: `grep -n 'pnpm add -g github:ideaSquared/' README.md`; a CI step runs `pnpm pack` and installs the tarball
globally (or `npm i -g .`) then `<cmd> --version`.

**CLI-06** · SHOULD · Each supported OS is in the CI matrix (`ubuntu-latest`, plus `windows-latest` and
`macos-latest` when the README says the CLI supports them). [L3]
Check: `strategy.matrix.os` in `ci.yml` lists every OS the README names.

## Behaviour

**CLI-07** · MUST · `<cmd> --help` / `-h` prints usage to stdout and exits 0, and `<cmd> --version` prints the
`package.json` version and exits 0. [L3]
Check: `node dist/cli.js --version` equals `jq -r .version package.json`, exit code 0; `--help` exit code 0.

**CLI-08** · MUST · The CLI exits 0 on success and non-zero on any failure, writes errors and warnings to stderr and
results to stdout, and tests cover the exit code of at least one failure path. [L3]
Check: a test asserts a non-zero exit (or `process.exitCode`) for a failing command.

**CLI-09** · MUST · The CLI never prints secrets (tokens, webhook URLs, signing secrets) or personal data beyond the
signed-in GitHub login; it never accepts a secret as a command-line flag value and gets credentials from `gh auth
token`, a file, stdin or (in CI) an environment variable. [L3][S17]
Check: no flag in the argument parser is named `token`, `password`, `secret` or `key`; tests assert redaction where
credentials are handled.

**CLI-10** · MUST · Prompts and interactive UI appear only when stdin is a TTY; without a TTY the CLI fails with a
message naming the flag to pass. Actions on production need an explicit confirmation that `--yes` does not skip. [L3]
Check: tests cover the non-TTY path for each prompt and the production confirmation.

**CLI-11** · MUST · Colour is off when `NO_COLOR` is set to a non-empty value or the stream is not a TTY. [L3][L4]
Check: `NO_COLOR=1 node dist/cli.js --help | grep -c $'\e\['` is 0.

## Versions and releases

**CLI-12** · MUST · `package.json` `version` follows SemVer and is bumped in the release PR; each release has an
annotated tag `vX.Y.Z` and a GitHub Release whose notes are generated from the Conventional Commits since the last
tag. [L5][S7]
Check: `gh release view v$(jq -r .version package.json)` exists.

**CLI-13** · MUST · Consumers that track a moving major tag (`v1`) only get compatible changes: a commit marked
breaking (`type!:` or a `BREAKING CHANGE:` footer) never moves the major tag and ships as the next major. [L5]
Check: the release workflow skips moving `vN` when a pushed commit is breaking (as shipper's `release-v1` job does).

**CLI-14** · SHOULD · `CHANGELOG.md` in Keep a Changelog format, updated in each release PR (release-please or
changesets can write it). [L6]
Check: `test -f CHANGELOG.md`; its top entry matches `package.json` `version`.

## Output and logging

**CLI-15** · MUST · CLI output to people uses the terminal (`console`, workflow annotations), not
`@ideasquared/log`; any part of the repo that runs as a server follows COMMON-38. [S17]
Check: `CLAUDE.md` states the CLI output rule; server paths pass COMMON-38's check.

## Sources

- [L1] npm `package.json` (`bin`, `files`, `type`): https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- [L2] pnpm `add` from a git repository: https://pnpm.io/cli/add
- [L3] Command Line Interface Guidelines (exit codes, stdout/stderr, `--help`/`--version`, secrets, TTY, colour): https://clig.dev/
- [L4] NO_COLOR: https://no-color.org/
- [L5] Semantic Versioning 2.0.0: https://semver.org/
- [L6] Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- [S7] Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/
- [S17] ideaSquared logging skill (canonical): `agent-idea/.claude/skills/logging/SKILL.md`

## Current gaps

MUST gaps from reading the repos on 2026-11-22 (dist was not run on Node 24).

| Repo       | Rule ID | What is missing                                                                       |
| ---------- | ------- | ------------------------------------------------------------------------------------- |
| eng        | CLI-05  | no CI step installs the packed CLI and runs it                                        |
| eng        | CLI-07  | no `--version`                                                                        |
| eng        | CLI-12  | `version` stays `0.1.0`; no tags or GitHub Releases                                   |
| shipper    | CLI-05  | no CI step installs the packed CLI and runs it                                        |
| shipper    | CLI-07  | no `--version`                                                                        |
| shipper    | CLI-12  | `version` stays `0.1.0`; releases are only the moving `v1` tag, no `vX.Y.Z` or notes |
| agent-idea | CLI-05  | no CI step installs the packed CLI and runs it                                        |
| agent-idea | CLI-07  | `idea --version` fails with "Unknown option"                                          |
| agent-idea | CLI-12  | only package tags (`log-v*`, `ops-v*`); the `idea` CLI has no `vX.Y.Z` releases      |
