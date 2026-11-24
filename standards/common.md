# Common standards (every repo)

Applies to every repo in [README.md](README.md), whatever its type.

**Owner decisions (fixed; change only with the owner's approval):** Node.js 24 LTS everywhere; Dependabot (not
Renovate); pnpm workspaces; deploys through `ideaSquared/shipper` (`ship.yaml` + its reusable workflow); logging
through `@ideasquared/log` with the shared logging skill (canonical copy `agent-idea/.claude/skills/logging/SKILL.md`);
Conventional Commits; TypeScript strict; GitHub for work tracking (pull requests by default); Cloudflare frontends on
Workers static assets; static sites also move from Netlify to Workers static assets, deployed through shipper; a staging environment is required for anything public-facing, optional for internal tools
(used only by the ideaSquared team); cli-tool repos accept Node.js 24 or newer (`>=24`), deployed apps pin 24 only;
products are proprietary (`UNLICENSED`, all rights reserved) unless the repo says otherwise; code-owner review is
recommended, not required, while the org has one maintainer; a scheduled GitHub Actions workflow that checks
production health URLs and alerts Discord counts as the external uptime monitor.

Rules about `package.json`, pnpm or TypeScript apply only when the repo has a `package.json` or `.ts` files.

## Toolchain

**COMMON-01** · MUST · `.nvmrc` at the repo root pins Node.js 24 (major `24`, optionally a full `24.x.y`). [S1][S2]
Check: `grep -Eq '^v?24(\.[0-9]+){0,2}$' .nvmrc`

**COMMON-02** · MUST · Root `package.json` `engines.node` has a minimum of major 24 and excludes the next major
(e.g. `>=24.0.0 <25.0.0`). A cli-tool repo runs on developers' own machines and instead uses `>=24` with no upper
bound, so a newer Node does not stop it installing. [S1]
Check: `jq -r .engines.node package.json` matches `^>=24(\.\d+){0,2} <25`; cli-tool repos match `^>=24(\.\d+){0,2}$`.

**COMMON-03** · MUST · Every `actions/setup-node` step reads the version from the repo (`node-version-file: .nvmrc`),
never a hard-coded `node-version`.
Check: `grep -rn 'node-version:' .github/workflows` is empty, and every `setup-node` step has `node-version-file`.

**COMMON-04** · MUST · `package.json` `packageManager` pins an exact pnpm version (`pnpm@X.Y.Z`), `pnpm-lock.yaml` is
committed, and CI installs with `pnpm install --frozen-lockfile`. [S3]
Check: `jq -r .packageManager package.json` matches `^pnpm@\d+\.\d+\.\d+`; `git ls-files pnpm-lock.yaml`; grep CI
for `pnpm install --frozen-lockfile`.

**COMMON-05** · MUST · `pnpm-workspace.yaml` exists at the root; it lists the workspace packages (multi-package repos)
and holds the repo's pnpm settings (pnpm 10+ reads settings from it, `.npmrc` is for auth and registry only). [S4]
Check: `test -f pnpm-workspace.yaml`

**COMMON-06** · SHOULD · `pnpm-workspace.yaml` sets the supply-chain settings: `minimumReleaseAge` of at least `1440`
(minutes), an explicit `allowBuilds` list instead of `dangerouslyAllowAllBuilds`, `strictDepBuilds` and
`blockExoticSubdeps` not set to `false`, and `trustPolicy: no-downgrade`. [S3]
Check: `yq '.minimumReleaseAge >= 1440 and .trustPolicy == "no-downgrade" and (.dangerouslyAllowAllBuilds != true)' pnpm-workspace.yaml`

## TypeScript

**COMMON-07** · MUST · Every `tsconfig*.json` that type-checks code has `"strict": true` (directly or through
`extends`). [S5]
Check: `pnpm exec tsc --showConfig -p <each tsconfig> | jq .compilerOptions.strict` is `true`.

**COMMON-08** · SHOULD · The base tsconfig also sets `noUncheckedIndexedAccess: true` and
`verbatimModuleSyntax: true`. [S5]
Check: `tsc --showConfig` shows both `true`.

**COMMON-09** · MUST · `package.json` has a `typecheck` (or `type-check`) script that runs `tsc --noEmit` across the
repo, and CI runs it.
Check: `jq -e '.scripts.typecheck // .scripts["type-check"]' package.json`; the script is called in `ci.yml`.

## Lint and format

**COMMON-10** · MUST · ESLint runs from a flat config (`eslint.config.{js,mjs,ts}`) through a `lint` script, and CI
runs it. [S6]
Check: `ls eslint.config.*`; `jq -e .scripts.lint package.json`; `pnpm lint` in `ci.yml`.

**COMMON-11** · MUST · Prettier is configured (`.prettierrc*` or `prettier` key) with a `format:check` script
(`prettier --check .`), and CI runs it.
Check: `ls .prettierrc*`; `jq -e '.scripts["format:check"]' package.json`; called in `ci.yml`.

**COMMON-12** · SHOULD · `.editorconfig` at the root agrees with the Prettier config (indent style and width, LF,
final newline).
Check: `test -f .editorconfig`

## Commits and pull requests

**COMMON-13** · MUST · Commit messages follow Conventional Commits, enforced by `commitlint.config.{js,mjs,ts}`
extending `@commitlint/config-conventional` and a `.husky/commit-msg` hook that runs it. [S7]
Check: `grep -q config-conventional commitlint.config.*`; `grep -q commitlint .husky/commit-msg`

**COMMON-14** · SHOULD · Pull requests are squash-merged (merge commits off), so the PR title becomes the commit
subject, and CI checks the PR title against Conventional Commits. [S7]
Check: `gh api repos/{o}/{r} --jq '[.allow_squash_merge,.allow_merge_commit]'` is `[true,false]`; a CI job lints
`github.event.pull_request.title` (passed through `env:`, see COMMON-22).

## CI

**COMMON-15** · MUST · `.github/workflows/ci.yml` runs on `pull_request` and on `push` to the default branch and runs,
in order: frozen install, `format:check`, `lint`, `typecheck`, `test`, and `build` when the repo builds anything.
Check: read `on:` and the step list of `ci.yml`.

**COMMON-16** · MUST · Every workflow sets `concurrency`; pull-request runs cancel superseded runs, default-branch runs
never cancel (a deploy or migration is never cut off, and an older commit never deploys after a newer one).
Check: `yq '.concurrency' .github/workflows/*.yml` is set in each; default-branch `cancel-in-progress` is false; the
group a default-branch run uses is the same for every run on that branch or environment (it does not contain
`github.sha` or `github.run_id`). Older commits are also refused at deploy time by shipper's gate, except a rollback.

**COMMON-17** · SHOULD · Every job sets `timeout-minutes`.
Check: `yq '.jobs[] | select(has("timeout-minutes") | not)' .github/workflows/*.yml` is empty.

**COMMON-18** · MUST · The default branch's ruleset requires the CI job(s) as status checks, and every deployable
repo lists the same job names in `ship.yaml` `checks`.
Check: `gh api repos/{o}/{r}/rules/branches/{default}` has a `required_status_checks` rule whose contexts equal
`yq .checks ship.yaml`.

## GitHub Actions hardening

**COMMON-19** · MUST · Every `uses:` reference is pinned to a full 40-character commit SHA with a version comment
(`uses: actions/checkout@<sha> # v5.0.0`); the one exception is `ideaSquared/*` reusable workflows, which use their
moving major tag (`@v1`). [S8][S9]
Check: `grep -rhoE 'uses: [^ ]+@[^ #]+' .github | grep -vE '@[0-9a-f]{40}$|^uses: \./|^uses: ideaSquared/[^/@]+/\.github/workflows/[^@]+\.ya?ml@v[0-9]+$'` is empty.

**COMMON-20** · MUST · Every workflow declares a top-level `permissions:` of `contents: read` (or `{}`), and any write
scope is granted on the job that needs it. [S8][S9]
Check: `yq -e '.permissions' <each workflow>`; no top-level scope other than `contents: read`.

**COMMON-21** · MUST · No workflow triggered by `pull_request_target` or `workflow_run` checks out or runs code from
the pull request. [S8][S9]
Check: in workflows with those triggers, no `actions/checkout` step with `ref:` set to a PR head ref/SHA and no
`run:` that executes repo scripts.

**COMMON-22** · MUST · Untrusted event data (`github.event.pull_request.title/body`, `github.head_ref`, issue and
comment bodies, commit messages) is never interpolated into a `run:` script; it is passed through `env:`. [S8]
Check: parse each workflow and inspect every complete `run` value (single-line and `run: |` blocks):
`yq '.. | select(has("run")) | .run' .github/workflows/*.yml | grep -nE '\$\{\{ *github\.(event\.(pull_request|issue|comment|commits|head_commit)|head_ref)'` is empty.

**COMMON-23** · SHOULD · `actions/checkout` sets `persist-credentials: false` unless the job pushes to the repo.
Check: every checkout step without a later `git push` in the job has `persist-credentials: false`.

## Dependency updates

**COMMON-24** · MUST · `.github/dependabot.yml` (`version: 2`) has an `npm` entry (it covers pnpm lockfiles) and a
`github-actions` entry, both `directory: /` and at least weekly; repos with a Dockerfile or compose file add `docker`
and `docker-compose` entries (see VPS-11). [S10][S11]
Check: `yq '.updates[].package-ecosystem' .github/dependabot.yml` includes `npm` and `github-actions`.

**COMMON-25** · SHOULD · Dependabot groups minor and patch updates into one PR per ecosystem, uses
`commit-message.prefix: chore(deps)` (passes commitlint), and sets `cooldown.default-days` of at least 3. [S10]
Check: each entry has `groups` with `update-types: [minor, patch]`, the prefix, and `cooldown.default-days >= 3`.

**COMMON-26** · MUST · No other update bot is configured (no `renovate.json`, `.renovaterc*`, or `renovate` key in
`package.json`).
Check: `ls renovate.json .renovaterc* .github/renovate.json 2>/dev/null` is empty.

**COMMON-27** · MUST · Dependabot alerts and Dependabot security updates are enabled on the repo. [S11][S12]
Check: `gh api repos/{o}/{r}/vulnerability-alerts` returns 204;
`gh api repos/{o}/{r} --jq .security_and_analysis.dependabot_security_updates.status` is `enabled`.

## Ownership and review

**COMMON-28** · MUST · `.github/CODEOWNERS` exists and its first rule is `* @ideaSquared/<team>`. [S13]
Check: `grep -E '^\* @ideaSquared/' .github/CODEOWNERS`

**COMMON-29** · MUST · `.github/pull_request_template.md` (or `PULL_REQUEST_TEMPLATE.md`) has headings for
`Summary`, `Test plan` and `Linked issue`.
Check: `grep -ciE '^#+ *(summary|test plan|linked issue)' .github/pull_request_template.md` is 3.

**COMMON-30** · MUST · The default branch is protected by a ruleset with: Restrict deletions, Block force pushes,
Require a pull request before merging, and Require status checks to pass (COMMON-18). Require review from Code
Owners is a SHOULD while the org has one maintainer, because GitHub does not let an author approve their own pull
request; turn it on when a second maintainer joins. [S14][S12]
Check: `gh api repos/{o}/{r}/rules/branches/{default} --jq '[.[].type]'` contains `deletion`, `non_fast_forward`,
`pull_request` and `required_status_checks`; report (do not fail) when `require_code_owner_review` is false.

## Secrets

**COMMON-31** · MUST · No secret is committed: `.env*` and `.dev.vars*` are git-ignored except `*.example` files,
and every variable the code reads is listed (without a value) in an example file. [S15][S16]
Check: `git ls-files | grep -E '(^|/)(\.env|\.dev\.vars)(\.|$)' | grep -v '\.example$'` is empty.

**COMMON-32** · MUST · Secret scanning and push protection are on wherever GitHub offers them for the repo
(always for public repos). [S12]
Check: `gh api repos/{o}/{r} --jq '.security_and_analysis | .secret_scanning.status, .secret_scanning_push_protection.status'` are `enabled`.

**COMMON-33** · MUST · Deploy credentials (Cloudflare API token, SSH keys) are GitHub Environment
secrets on `staging` / `production`, not repository secrets, and production has a required reviewer or a branch
policy limiting it to the default branch. [S8]
Check: `gh api repos/{o}/{r}/actions/secrets --jq '.secrets[].name'` has no deploy credential;
`gh api repos/{o}/{r}/environments/production` has `protection_rules` or `deployment_branch_policy`.

**COMMON-34** · SHOULD · Workflows reach cloud providers that support it (AWS, GCP, Azure) through OIDC
(`permissions: id-token: write`) instead of long-lived keys. [S8]
Check: no `AWS_ACCESS_KEY_ID`-style secret is referenced in workflows.

## Documentation and agent instructions

**COMMON-35** · MUST · `README.md` at the root opens with one paragraph saying what the repo is, and has a heading
for running it locally (`Develop`, `Development`, `Quick start` or `Getting started`) and, for deployable repos, one
for deploying (`Deploy` or `Deployment`).
Check: `grep -iE '^## .*(develop|quick start|getting started)' README.md`; deployables: `grep -iE '^## .*deploy' README.md`.

**COMMON-36** · MUST · Exactly one of `CLAUDE.md` or `.claude/CLAUDE.md` exists; it gives the commands to type-check
and test, states the logging rule (`@ideasquared/log`, no personal data or secrets) and points to the logging
skill, and lists any `## Standards exceptions`.
Check: `ls CLAUDE.md .claude/CLAUDE.md 2>/dev/null | wc -l` is 1; it contains `@ideasquared/log` (or, for
cli-tool-only repos, the CLI output rule) and `skills/logging`.

**COMMON-37** · MUST · `.claude/skills/logging/SKILL.md` is byte-identical to the canonical copy in `agent-idea`.
Check: `sha256sum` equals that of `agent-idea/.claude/skills/logging/SKILL.md` on its default branch.

## Logging

**COMMON-38** · MUST · Server-side code (Workers, services, bots, cron jobs) logs only through `@ideasquared/log`,
and CI fails on `console.*` in server code (ESLint `no-console: error`, or a grep step allowing
`// logging-exempt: <reason>`); CLI output is exempt (cli-tool.md). [S17]
Check: `no-console` is `error` in the ESLint config for server paths, or `ci.yml` has the console grep step.

## Security policy, licence, visibility

**COMMON-39** · MUST · `SECURITY.md` (root or `.github/`) says how to report a vulnerability privately (GitHub private
vulnerability reporting link or a security mailbox) and what to expect. [S12][S18]
Check: `ls SECURITY.md .github/SECURITY.md`; it contains `security/advisories/new` or a `mailto:`.

**COMMON-40** · MUST · Root `package.json` has `"private": true` (nothing is published to npm unless the repo says
so), and has a top-level `LICENSE`. Products are proprietary: `package.json` `license` is `"UNLICENSED"` and
`LICENSE` reads "Copyright (c) <year> ideaSquared. All rights reserved." with nothing granting reuse. A repo that is
meant to be reused (for example shipper) may instead name an OSI licence whose SPDX id matches `package.json`
`license`. [S12][S19]
Check: `jq '.private, .license' package.json`; `test -f LICENSE`; if `license` is `UNLICENSED`, `LICENSE` contains
`All rights reserved`, otherwise it names the same SPDX licence.

**COMMON-41** · SHOULD · Public repos run the OpenSSF Scorecard action weekly and on pushes to the default branch,
uploading SARIF to code scanning. [S12]
Check: a workflow uses `ossf/scorecard-action` (SHA-pinned) with `schedule:`.

## Sources

- [S1] Node.js release schedule (24.x: maintenance LTS from 2026-10-20, end of life 2028-04-30): https://github.com/nodejs/release#release-schedule
- [S2] Node.js previous releases ("production applications should only use Active LTS or Maintenance LTS"): https://nodejs.org/en/about/previous-releases
- [S3] pnpm supply-chain security: https://pnpm.io/supply-chain-security
- [S4] pnpm settings (`pnpm-workspace.yaml`): https://pnpm.io/settings
- [S5] TypeScript `strict` and related options: https://www.typescriptlang.org/tsconfig/#strict
- [S6] ESLint flat config: https://eslint.org/docs/latest/use/configure/configuration-files
- [S7] Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/ and commitlint: https://commitlint.js.org/
- [S8] GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- [S9] OpenSSF Scorecard checks (Pinned-Dependencies, Token-Permissions, Dangerous-Workflow): https://github.com/ossf/scorecard/blob/main/docs/checks.md
- [S10] Dependabot options reference (`groups`, `cooldown`, `commit-message`): https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
- [S11] Docker build best practices (Dependabot keeps digest pins current): https://docs.docker.com/build/building/best-practices/
- [S12] OpenSSF Scorecard checks (Branch-Protection, Code-Review, Security-Policy, License, Vulnerabilities): https://github.com/ossf/scorecard/blob/main/docs/checks.md
- [S13] GitHub CODEOWNERS: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- [S14] GitHub rulesets, available rules: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- [S15] The Twelve-Factor App, III. Config: https://12factor.net/config
- [S16] Cloudflare Workers secrets (`.dev.vars` / `.env` git-ignored): https://developers.cloudflare.com/workers/configuration/secrets/
- [S17] ideaSquared logging skill (canonical): `agent-idea/.claude/skills/logging/SKILL.md`
- [S18] GitHub security policy: https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository
- [S19] npm `package.json` `private` and `license`: https://docs.npmjs.com/cli/v11/configuring-npm/package-json

## Current gaps

MUST gaps from the Consistency sweep of 2026-11-24 (default branches). "PR" means a `chore(standards)` PR is open
and closes it. SHOULD gaps are not listed here.

| Repo                | Rule ID    | What is missing                                                                                          |
| ------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| creatrgrid          | COMMON-40  | no `LICENSE` (PR creatrgrid#113)                                                                         |
| pairflix            | COMMON-36  | `CLAUDE.md` lacks the `skills/logging` path (PR pairflix#144)                                            |
| agent-idea          | COMMON-16  | `ci.yml` PR runs never cancel superseded runs (PR agent-idea#32)                                         |
| agent-idea          | COMMON-02 | `engines.node` is `>=24.0.0 <25.0.0`; cli-tool needs `>=24` (PR agent-idea#32)                           |
| shipper             | COMMON-02  | `engines.node` was `>=24.0.0 <25.0.0`; cli-tool needs `>=24` (PR shipper#42)                             |
| shipper             | COMMON-30  | no ruleset applies to `main` (needs a person)                                                            |
| shipper             | COMMON-18  | no required status checks (needs a person)                                                               |
| shipper             | COMMON-32  | secret scanning push protection is disabled (needs a person)                                             |
| eng                 | COMMON-30  | no ruleset applies to `main` (needs a person)                                                            |
| eng                 | COMMON-18  | no required status checks (needs a person)                                                               |
| eng                 | COMMON-32  | secret scanning push protection is disabled (needs a person)                                             |
| adopt-dont-shop     | COMMON-18  | `main` ruleset requires 3 checks, `ship.yaml` lists 4 (`Production Image Smoke` missing; needs a person) |
| adopt-dont-shop     | COMMON-32  | secret scanning push protection is disabled (needs a person)                                             |

Not checked (the sweep's API access is blocked): COMMON-27 and COMMON-33 in every repo; COMMON-18, -30 and -32 in
creatrgrid, pairflix, agent-idea, ideasquared-bot and ideasquared-website (creatrgrid's CI notes that rulesets are
unavailable on its plan). eng's `LICENSE` is MIT with a named holder: confirm that is intended (COMMON-40).
