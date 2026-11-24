# VPS app standards

Applies to repos of type `vps-app` (see [README.md](README.md)), on top of [common.md](common.md): Docker Compose
stacks deployed to a VPS behind a reverse proxy.

## Images

**VPS-01** · MUST · Every production image is built from a multi-stage Dockerfile whose final stage holds only the
runtime and built output (no compilers, dev dependencies or source maps it does not serve). [D1]
Check: each `Dockerfile*` has two or more `FROM … AS` stages; the production target copies from a build stage.

**VPS-02** · MUST · Every base image (`FROM`) and every third-party `image:` in a staging or production compose file
is pinned as `name:tag@sha256:<digest>`. [D1][D3]
Check: every `FROM` that names a registry image, not an earlier stage alias (`FROM base AS runtime`), has
`@sha256:`; every third-party `image:` in the resolved configs (`docker compose -f docker-compose.yml -f
docker-compose.prod.yml config`, and the same for staging) has `@sha256:`. Own images are covered by VPS-07.

**VPS-03** · MUST · The production stage switches to a non-root user with an explicit numeric UID/GID (`USER 1001`
or a named user created with `-u`). [D1][D2]
Check: the last `USER` in each production target is not `root` / `0`.

**VPS-04** · MUST · A `.dockerignore` at each build context excludes at least `.git`, `node_modules`, `.env*` and
local build output. [D1]
Check: `grep -E '^(\.git|node_modules|\.env)' .dockerignore` matches all three.

**VPS-05** · MUST · No secret is baked into an image: no `ARG`/`ENV` carries a secret, and build-time secrets use
BuildKit `RUN --mount=type=secret`. [D2]
Check: `grep -nE '^(ARG|ENV) .*(SECRET|TOKEN|PASSWORD|KEY)' Dockerfile*` is empty.

**VPS-06** · SHOULD · Node processes run under an init (`dumb-init`, `tini`, or compose `init: true`) so SIGTERM
reaches the app and zombies are reaped.
Check: production `ENTRYPOINT` uses an init, or each service sets `init: true`.

**VPS-07** · MUST · Production images are built in CI, tagged with the full git SHA, pushed to GHCR, and the
production and staging compose files reference them by that tag (never `latest`). [D1]
Check: own `image:` lines in `docker-compose.{prod,staging}.yml` use `${…SHA…}`-style tags; `grep -n ':latest'` is empty.

**VPS-08** · MUST · CI scans every production image (Trivy or Grype) and fails on fixable CRITICAL or HIGH
vulnerabilities; accepted findings are listed with a reason and expiry in `.trivyignore` (or equivalent). [D2]
Check: a workflow runs the scanner on each image with `--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1`.

**VPS-09** · SHOULD · Images are published with an SBOM and build provenance (`docker buildx build --sbom=true
--provenance=mode=max`, or `actions/attest-build-provenance`), and deploys verify them. [D4][D5]
Check: the image workflow emits SBOM and provenance attestations; `gh attestation verify` or `cosign verify` runs
before deploy.

**VPS-10** · SHOULD · Images are rebuilt at least weekly (`--pull`) so base-image patches land without a code change.
[D1]
Check: the image workflow has a `schedule:` trigger and builds with `--pull`.

**VPS-11** · MUST · `.github/dependabot.yml` has `docker` and `docker-compose` entries covering every Dockerfile and
compose directory, so digest pins stay current. [D1][D3]
Check: `yq '.updates[].package-ecosystem' .github/dependabot.yml` includes `docker` and `docker-compose`.

## Compose

**VPS-12** · MUST · Compose files follow one layout: `docker-compose.yml` (shared base and dev),
`docker-compose.staging.yml` and `docker-compose.prod.yml` (overrides), and CI validates each combination with
`docker compose -f … config --quiet`. [D6]
Check: the three files exist; `ci.yml` runs `docker compose … config` for staging and production.

**VPS-13** · MUST · Every long-running service has a healthcheck (image `HEALTHCHECK` or compose `healthcheck`),
and services that depend on another use `depends_on: { <svc>: { condition: service_healthy } }`. [D6]
Check: `docker compose -f docker-compose.yml -f docker-compose.prod.yml config --format json | jq` shows a
`healthcheck` (or image healthcheck) for every service with a `restart` policy.

**VPS-14** · MUST · Every production service sets `restart: unless-stopped` (or `always`), a memory limit
(`deploy.resources.limits.memory`), `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]` (adding back only
named capabilities). [D2][D6]
Check: the resolved production config has all four keys on every service.

**VPS-15** · SHOULD · Services run with `read_only: true` and `tmpfs` for scratch paths where the app allows it. [D2]
Check: `read_only: true` on each stateless service.

**VPS-16** · MUST · Only the reverse proxy publishes ports on public interfaces (80/443); databases, caches and
brokers publish none, and any operator port binds `127.0.0.1`. [D2]
Check: in the resolved production config, every `ports` entry belongs to the proxy or has `host_ip: 127.0.0.1`.

**VPS-17** · MUST · The Docker socket is never mounted into an application container; a tool that needs it goes
through a read-only socket proxy. [D2]
Check: `grep -n 'docker.sock' docker-compose*.yml` only matches a socket-proxy service.

**VPS-18** · MUST · Container logs rotate: every production service (or an `x-logging` anchor they all use) sets the
`json-file` driver with `max-size` and `max-file`. [D7]
Check: each service in the resolved production config has `logging.options.max-size`.

## Reverse proxy and TLS

**VPS-19** · MUST · TLS terminates at the reverse proxy with automatically renewed certificates (Let's Encrypt via
certbot or Caddy), redirects HTTP to HTTPS, allows only TLS 1.2 and 1.3, and the proxy config and a renewal runbook
are in the repo. [D8]
Check: `curl -sI http://<host>` returns 301 or 308 to `https://`; `openssl s_client -tls1_1 -connect <host>:443`
fails. Per proxy: nginx has `ssl_protocols TLSv1.2 TLSv1.3` and a runbook names the certbot renewal timer; Caddy
needs neither (it renews and redirects itself, and its defaults allow only TLS 1.2+), only its `Caddyfile` in the repo.

**VPS-20** · MUST · The proxy sends `Strict-Transport-Security`, `Content-Security-Policy` (with `frame-ancestors`),
`X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` on every response. [D9]
Check: `curl -sI https://<host>/` shows all four.

## Data, backups and migrations

**VPS-21** · MUST · Every database and every user-upload store is backed up automatically at least daily to
off-host object storage, encrypted, with the retention written down. [D10]
Check: a scheduled workflow or host timer runs the backup; a runbook states destination, encryption and retention.

**VPS-22** · MUST · Restores are tested automatically at least weekly (latest backup restored into a scratch database
and asserted to contain data), and a manual drill at least quarterly records the measured RTO and RPO. [D10]
Check: a workflow with `schedule:` restores the latest backup and fails on an empty restore; the drill log has an
entry within 92 days.

**VPS-23** · MUST · Schema migrations are versioned files owned by one service each, forward-only, never edited once
shipped (CI fails a PR that modifies one on the default branch), and run automatically on deploy before new code
takes traffic. [D11]
Check: CI has the modified-migration guard; the deploy runs migrations before switching traffic.

**VPS-24** · MUST · Every migration is backward compatible with the release before it (expand, then contract in a
later release), so a rollback to the previous images works against the migrated schema. [D11]
Check: CI runs the previous release's tests or smoke checks against the new schema, or the PR template has a
backward-compatibility checkbox enforced by review.

## Deploy, rollback, availability

**VPS-25** · MUST · Deploys go through shipper: `ship.yaml` with a `staging` environment and
`production.requires: [staging]`, and `dispatch.rollbackWorkflow` naming a workflow that redeploys a given SHA's
images. [C10]
Check: `yq '.environments.production.requires, .dispatch.rollbackWorkflow' ship.yaml`.

**VPS-26** · MUST · A rollback runbook exists and the rollback workflow is exercised on staging at least quarterly.
Check: `docs/runbooks/*rollback*.md` exists; a staging run of the rollback workflow within 92 days
(`gh run list --workflow <rollbackWorkflow>`).

**VPS-27** · SHOULD · Deploys are health-gated: new containers must pass their healthcheck before the old ones stop,
services handle SIGTERM within `stop_grace_period`, and a maintenance page covers any step that cannot avoid downtime.
Check: deploy script waits for `healthy`; services set `stop_grace_period`.

## Observability

**VPS-28** · MUST · Services log to stdout through `@ideasquared/log` (COMMON-38), the gateway exposes `/health`
(liveness) and `/health/ready` (readiness, checks its dependencies), and an external uptime check alerts on failure.
A scheduled GitHub Actions workflow (at least every 15 minutes) that requests each production health URL, fails when
one is down and alerts Discord counts as that check.
Check: both endpoints return 200 on staging; the uptime monitor is named in the runbooks, or a workflow with
`schedule:` requests the production health URLs and alerts on failure.

**VPS-29** · SHOULD · Metrics (Prometheus) and error tracking (GlitchTip or Sentry) run for production, with alerts
routed to the product's Discord channel through ideasquared-bot.
Check: compose files or runbooks define the metrics and error-tracking targets and the alert route.

## Host

**VPS-30** · MUST · Host hardening is scripted or documented in the repo and covers: SSH keys only
(`PasswordAuthentication no`, `PermitRootLogin no`), a default-deny firewall allowing only 22/80/443, unattended
security upgrades, and brute-force protection (fail2ban or equivalent). [D2][D12]
Check: `grep -rlE 'PasswordAuthentication no' docs infra deploy` and the same for `PermitRootLogin no`,
`ufw default deny`, `unattended-upgrades`, `fail2ban`.

**VPS-31** · MUST · Runtime secrets on the host are files readable only by the deploying user (mode 0600) or Docker
secrets, never values written into compose files. [D2][S15]
Check: compose files use `secrets:` or `env_file:` paths, no literal secret values; the runbook sets 0600.

## Sources

- [D1] Docker build best practices (multi-stage, digests, `.dockerignore`, non-root, rebuild): https://docs.docker.com/build/building/best-practices/
- [D2] OWASP Docker Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html
- [D3] Dependabot options reference (`docker`, `docker-compose` ecosystems): https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
- [D4] SLSA build levels: https://slsa.dev/spec/v1.0/levels
- [D5] Docker build attestations (SBOM, provenance): https://docs.docker.com/build/metadata/attestations/
- [D6] Compose file reference, services: https://docs.docker.com/reference/compose-file/services/
- [D7] Docker json-file logging driver (`max-size`, `max-file`): https://docs.docker.com/engine/logging/drivers/json-file/
- [D8] Mozilla server-side TLS guidelines: https://wiki.mozilla.org/Security/Server_Side_TLS
- [D9] OWASP HTTP Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- [D10] PostgreSQL backup and restore: https://www.postgresql.org/docs/current/backup.html
- [D11] The Twelve-Factor App, XII. Admin processes: https://12factor.net/admin-processes
- [D12] CIS benchmarks (Ubuntu Linux): https://www.cisecurity.org/benchmark/ubuntu_linux
- [C10] shipper README: `shipper/README.md`
- [S15] The Twelve-Factor App, III. Config: https://12factor.net/config

## Current gaps

No MUST gaps found by the Consistency sweep of 2026-11-24 (adopt-dont-shop). Not checked: VPS-19 (redirect),
VPS-20 (headers), VPS-26 (restore drill recency).
