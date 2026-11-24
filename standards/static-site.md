# Static site standards

Applies to repos of type `static-site` (see [README.md](README.md)), on top of [common.md](common.md): static HTML
served by Cloudflare Workers static assets and deployed through shipper. A site that needs a Worker script (server
logic, redirects that `_redirects` cannot express) also becomes `cloudflare-app` and follows that file too.

## Workers static assets

**SITE-01** · (retired) · Was "`netlify.toml` declares `[build] publish`". Retired 2026-11-22: static sites moved from
Netlify to Workers static assets (owner decision); replaced by SITE-12.

**SITE-02** · (retired) · Was "Netlify deploys through a shipper `external` component with auto-publishing stopped".
Retired 2026-11-22: replaced by SITE-17 (a native `cloudflare-worker` component).

**SITE-03** · (retired) · Was "HTTPS via Netlify's managed certificate". Retired 2026-11-22: replaced by SITE-15
(Cloudflare custom domains issue the certificate).

**SITE-12** · MUST · `wrangler.jsonc` at the repo root configures an assets-only Worker: `name`, `compatibility_date`
and an `assets` block whose `directory` is the published folder, with no `main` (and no Worker script) unless the
site is also `cloudflare-app`. [P1][P2]
Check: `test -f wrangler.jsonc`; `.assets.directory` is set; `.main` is absent.

**SITE-13** · MUST · `compatibility_date` is no more than 180 days old (as CF-03). [P3]
Check: `compatibility_date` within 180 days of today.

**SITE-14** · MUST · `assets.not_found_handling` is `"404-page"` and the published folder has a root `404.html`;
`assets.html_handling` is set explicitly (`"auto-trailing-slash"` unless the site's URLs need otherwise). [P2]
Check: `.assets.not_found_handling == "404-page"`; `.assets.html_handling` set; `test -f <directory>/404.html`.

**SITE-15** · MUST · Production serves from the site's own domain through `routes` entries with
`custom_domain: true` (the zone is on Cloudflare DNS, which issues the certificate), and `workers_dev` is `false`
once the custom domain is live. [P4][P5]
Check: `.routes[] | select(.custom_domain == true)` covers the apex and `www` (if used); `.workers_dev == false`;
`curl -sI https://<domain>/` returns 200.

**SITE-16** · MUST · `env.staging` defines a `-staging` name and its own custom-domain route (e.g.
`staging.<domain>`); a static site is public-facing, so staging is MUST (as CF-06). [P5]
Check: `.env.staging.name` ends in `-staging`; `.env.staging.routes` set.

**SITE-17** · MUST · Deploys go through shipper: `ship.yaml` has a `cloudflare-worker` component for the site with a
`health` URL (the site's `/`) per environment, `environments.staging.wranglerEnv: staging`, and
`production.requires: [staging]`; CI calls `ideaSquared/shipper/.github/workflows/deploy.yml@v1` and nothing runs `wrangler deploy`
directly. [P6]
Check: `yq '.components[].type' ship.yaml` is `cloudflare-worker`; `.environments.production.requires` has
`staging`; `.environments.staging.wranglerEnv` is `staging`; each component has `health`; CF-18's grep passes.

## Headers

**SITE-04** · MUST · `_headers` in the assets directory sets, for `/*`:
`Strict-Transport-Security: max-age=63072000; includeSubDomains`, a `Content-Security-Policy` without
`'unsafe-inline'` in `script-src` and with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` disabling unused features (at least
`camera=(), microphone=(), geolocation=()`), and `Cross-Origin-Opener-Policy: same-origin`. [P7][P8]
Check: `test -f <directory>/_headers`; `curl -sI https://<domain>/` shows all six headers with those values.

**SITE-05** · SHOULD · Only assets whose URL changes when their content changes (fingerprinted file names, e.g.
`/assets/app.3f9a1c.css`) get `Cache-Control: public, max-age=31536000, immutable` in `_headers`; anything else, including
HTML, keeps the default `public, max-age=0, must-revalidate`. [P7]
Check: every `_headers` rule with `immutable` matches only fingerprinted paths; HTML responses do not show it.

## CI

**SITE-06** · MUST · A `package.json` (pnpm, Node 24, per common.md) with `wrangler` as a dev dependency, and
`.github/workflows/ci.yml` running on every pull request: HTML validation with `html-validate` over every `.html`
file, a link check with `lychee` that fails on broken internal links (external links may only warn), and
`wrangler deploy --dry-run`. [W6][W7]
Check: `jq -e '.scripts["check:html"]' package.json` runs `html-validate`; `ci.yml` runs it, a SHA-pinned
`lycheeverse/lychee-action`, and `wrangler deploy --dry-run`.

**SITE-07** · MUST · CI runs Lighthouse CI against the site served locally (`wrangler dev` or a static server over the
assets directory) on every pull request, with `lighthouserc.json` asserting `categories:accessibility` ≥ 0.95
(error), `categories:best-practices` ≥ 0.9 (error), `categories:performance` ≥ 0.9 (warn) and `categories:seo` ≥ 0.9
(warn). [W8][W9]
Check: `jq '.ci.assert.assertions' lighthouserc.json` has the four entries; `ci.yml` runs `lhci autorun`.

**SITE-08** · SHOULD · `lighthouserc.json` adds resource budgets (`resource-summary:total:size` ≤ 500000 bytes,
`resource-summary:third-party:count` ≤ 5). [W8]
Check: both assertions present.

## Content baseline

**SITE-09** · MUST · Every page has `<html lang="…">`, a unique `<title>`, a `<meta name="viewport">`, and every
`<img>` has an `alt` attribute (html-validate's recommended rules cover these). [W6][W9]
Check: SITE-06's `html-validate` run passes with the `html-validate:recommended` preset (or stricter).

**SITE-10** · SHOULD · The assets directory has `robots.txt` and `sitemap.xml` (and `404.html`, SITE-14). [P2]
Check: the files exist in the assets directory.

## Secrets

**SITE-11** · (retired) · Was "no build secrets, Netlify secrets scanning on". Retired 2026-11-22: replaced by SITE-18.

**SITE-18** · MUST · The site needs no secrets: `wrangler.jsonc` has no `vars` or `secrets`, and no API key or token
appears in any published file; the only credential is shipper's deploy token (COMMON-33). [P9]
Check: `jq '.vars, .secrets' wrangler.jsonc` are null; `grep -rniE '(api[_-]?key|secret|token)["'\'' ]*[:=]' <assets directory>` is empty.

## Sources

- [P1] Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- [P2] Static assets routing for static sites (assets-only config, `not_found_handling: "404-page"`, `html_handling`): https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/
- [P3] Compatibility dates: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- [P4] Workers custom domains (`routes` with `custom_domain: true`, active Cloudflare zone): https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- [P5] Wrangler configuration (`env`, `routes`, `workers_dev`): https://developers.cloudflare.com/workers/wrangler/configuration/
- [P6] shipper README (`ship.yaml`, `cloudflare-worker` components, health checks): `shipper/README.md`
- [P7] Workers static assets headers (`_headers`, default caching): https://developers.cloudflare.com/workers/static-assets/headers/
- [P8] OWASP HTTP Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- [P9] Workers secrets (never in `vars`): https://developers.cloudflare.com/workers/configuration/secrets/
- [W6] html-validate: https://html-validate.org/
- [W7] lychee link checker action: https://github.com/lycheeverse/lychee-action
- [W8] Lighthouse CI configuration (`lighthouserc.json`, assertions, budgets): https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- [W9] WCAG 2.2: https://www.w3.org/TR/WCAG22/

## Current gaps

No MUST gaps found by the Consistency sweep of 2026-11-24. ideasquared-website is served by Cloudflare Workers
static assets; the six SITE-04 headers are live.

Open question: CF-18 and SITE-17 say `deploy.yml@v1`, but agent-idea and ideasquared-website pin shipper to a SHA
(with a CI check that the pins match). The rule and the repos disagree; the rule needs a decision (see COMMON-19).
