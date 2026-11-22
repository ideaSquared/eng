# ideaSquared engineering standards

The golden path for every ideaSquared repo: one file of rules every repo follows, plus one file per repo type.
Each rule is concrete enough for a script or an agent to check (a file that must exist, a config key and its value,
a CI job, a script name). They are based on current external best practice (official docs first), not on what the
repos happen to do today; each file ends with the sources it relies on.

| File                                   | Applies to                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| [common.md](common.md)                 | every repo                                                        |
| [cloudflare-app.md](cloudflare-app.md) | Workers (API and static-asset frontends), D1, R2, Queues, Cron    |
| [vps-app.md](vps-app.md)               | Docker Compose stacks deployed to a VPS behind a reverse proxy    |
| [cli-tool.md](cli-tool.md)             | Node CLIs installed from GitHub with a committed `dist/`          |
| [static-site.md](static-site.md)       | static HTML sites served by Cloudflare Workers static assets      |

## Rule format

Every rule has an ID (`COMMON-05`, `CF-12`, `VPS-03`, `CLI-02`, `SITE-04`), a level, one sentence, and a `Check:`.

- **MUST**: a repo that breaks it has a gap; the sweep opens a PR to fix it.
- **SHOULD**: the default; a repo may depart from it with a reason written in its `CLAUDE.md` under
  `## Standards exceptions` (rule ID and one line of why). The sweep reports SHOULD gaps without an exception, but
  does not fail on them.
- A rule that only applies when something exists (a `package.json`, TypeScript files, a Dockerfile, a D1 binding)
  says so; it is not a gap when that thing is absent.
- IDs are never reused. A retired rule keeps its ID with `(retired)` and the reason.

## How a repo's type is decided

The table below is the source of truth. A repo can have more than one type; it then follows `common.md` and every
type file listed for it. When the table and a repo disagree, the markers below decide what the table should say, and
the fix is a PR to this table.

| Type             | Marker in the repo                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `cloudflare-app` | a deployed `wrangler.jsonc` (or legacy `wrangler.json` / `wrangler.toml`) with a Worker script     |
| `vps-app`        | a `docker-compose*.yml` used for staging or production, plus a `Dockerfile*`                      |
| `cli-tool`       | a `bin` entry in a `package.json` whose target is under a committed `dist/`                       |
| `static-site`    | HTML served as-is by an assets-only Worker (`wrangler.jsonc` with `assets` and no `main`)          |

## Repos

| Repo                  | Type(s)                       | Notes                                                                       |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `creatrgrid`          | cloudflare-app                | Hono API Worker + D1/Drizzle, three React/Vite frontends on static assets   |
| `pairflix`            | cloudflare-app                | same stack as creatrgrid; frontends still on Cloudflare Pages (a gap)       |
| `agent-idea`          | cloudflare-app, cli-tool      | internal tool: one Worker plus the `idea` CLI and the `@ideasquared/log` package           |
| `ideasquared-bot`     | cloudflare-app                | internal tool: one Worker with a Durable Object                                            |
| `adopt-dont-shop`     | vps-app                       | React apps, Fastify gateway, gRPC services, Postgres, nginx, Docker Compose |
| `eng`                 | cli-tool                      | also ships `install.sh` / `install.ps1`                                     |
| `shipper`             | cli-tool                      | also ships the reusable deploy workflow every deployable repo calls         |
| `ideasquared-website` | static-site                   | static HTML on Workers static assets (still on Netlify today: a gap)        |

"Internal tool" means used only by the ideaSquared team, not by customers or the public; rules that differ for
internal tools (CF-06, CF-07) say so. Every other repo is public-facing.

A new repo is added to this table in the PR that creates it (or the first PR after).

## How the Consistency sweep uses them

The Consistency sweep is a weekly scheduled task. For each repo in the table it:

1. reads `common.md` and the type file(s) for that repo;
2. runs each rule's `Check:` against the repo's default branch (settings-based checks use `gh api`);
3. skips rules the repo lists under `## Standards exceptions` in its `CLAUDE.md` (SHOULD rules only; a MUST
   cannot be excepted, only changed here);
4. opens at most one PR per repo, titled `chore(standards): close <n> gaps`, fixing the gaps it can fix in files
   (one commit per rule ID, the ID in the commit body), and lists the gaps that need a person (repo settings,
   secrets, infrastructure) in the PR body;
5. updates the "Current gaps" tables here when a gap is closed or a new one appears.

The sweep never changes a rule. If a rule looks wrong while fixing a repo, it says so in the PR body.

## Changing a standard

Open a PR to `eng` that edits the rule (and its sources) and the gap tables it affects. Say in the PR body why the
current rule is wrong and which repos change. Decisions the owner has made are listed at the top of `common.md`;
reopening one needs the owner's approval on the PR.
