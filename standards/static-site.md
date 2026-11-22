# Static site standards

Applies to repos of type `static-site` (see [README.md](README.md)), on top of [common.md](common.md): static HTML
hosted on Netlify.

## Hosting and deploy

**SITE-01** · MUST · `netlify.toml` at the repo root declares `[build] publish` (and `command` if there is a build),
so hosting config lives in the repo, not only in the Netlify UI. [W1]
Check: `test -f netlify.toml`; it has a `[build]` table with `publish`.

**SITE-02** · MUST · Production deploys go through shipper: `ship.yaml` with an `external` component whose workflow
deploys the checked commit (`netlify deploy --prod --dir <publish>` using a `NETLIFY_AUTH_TOKEN` Environment secret,
COMMON-33), and Netlify's own auto-publishing of the production branch is stopped; Netlify deploy previews for pull
requests stay on. [C10][W2]
Check: `yq '.components[].type' ship.yaml` is `external`; the named workflow runs `netlify deploy --prod`; the
Netlify site shows "Auto publishing: locked/stopped".

**SITE-03** · MUST · The site is served only over HTTPS on its custom domain (Netlify's managed certificate with
"Force HTTPS" on), and the `*.netlify.app` host redirects to it. [W3]
Check: `curl -sI http://<domain>` and `curl -sI https://<site>.netlify.app` both return 301 to `https://<domain>`.

## Security headers

**SITE-04** · MUST · `netlify.toml` (`[[headers]] for = "/*"`) or `_headers` in the publish directory sets:
`Strict-Transport-Security: max-age=63072000; includeSubDomains`, a `Content-Security-Policy` without
`'unsafe-inline'` in `script-src` and with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling unused features (at least
`camera=(), microphone=(), geolocation=()`), and `Cross-Origin-Opener-Policy: same-origin`. [W4][W5]
Check: `curl -sI https://<domain>/` shows all six headers with those values.

**SITE-05** · SHOULD · Fingerprinted or rarely changing assets (`/assets/*`, fonts) get
`Cache-Control: public, max-age=31536000, immutable`; HTML keeps Netlify's default revalidation. [W4]
Check: `curl -sI https://<domain>/assets/<file>` shows `immutable`; HTML does not.

## CI

**SITE-06** · MUST · A `package.json` (pnpm, Node 24, per common.md) and `.github/workflows/ci.yml` run on every pull
request: HTML validation with `html-validate` over every `.html` file, and a link check with `lychee` that fails on
broken internal links (external links may only warn). [W6][W7]
Check: `jq -e '.scripts["check:html"]' package.json` runs `html-validate`; `ci.yml` runs it and a SHA-pinned
`lycheeverse/lychee-action` with `--offline` (internal, failing) or `fail: true` for internal links.

**SITE-07** · MUST · CI runs Lighthouse CI against the built site on every pull request, with `lighthouserc.json`
asserting `categories:accessibility` ≥ 0.95 (error), `categories:best-practices` ≥ 0.9 (error),
`categories:performance` ≥ 0.9 (warn) and `categories:seo` ≥ 0.9 (warn). [W8][W9]
Check: `jq '.ci.assert.assertions' lighthouserc.json` has the four entries; `ci.yml` runs `lhci autorun`.

**SITE-08** · SHOULD · `lighthouserc.json` adds resource budgets (`resource-summary:total:size` ≤ 500000 bytes,
`resource-summary:third-party:count` ≤ 5). [W8]
Check: both assertions present.

## Content baseline

**SITE-09** · MUST · Every page has `<html lang="…">`, a unique `<title>`, a `<meta name="viewport">`, and every
`<img>` has an `alt` attribute (html-validate's recommended rules cover these). [W6][W9]
Check: SITE-06's `html-validate` run passes with the `html-validate:recommended` preset (or stricter).

**SITE-10** · SHOULD · The publish directory has `404.html`, `robots.txt` and `sitemap.xml`. [W1]
Check: the three files exist in the publish directory.

## Secrets

**SITE-11** · MUST · The build needs no secrets: `netlify.toml` sets no secret values, no API key or token appears in
any published file, and Netlify's secrets scanning is left on. [W10]
Check: `grep -rniE '(api[_-]?key|secret|token)[\"'\'' ]*[:=]' <publish dir> netlify.toml` is empty; the site has no
`SECRETS_SCAN_ENABLED=false`.

## Sources

- [W1] Netlify file-based configuration (`netlify.toml`): https://docs.netlify.com/configure-builds/file-based-configuration/
- [W2] Netlify deploys (locking and stopping auto publishing, deploy previews): https://docs.netlify.com/site-deploys/manage-deploys/
- [W3] Netlify HTTPS: https://docs.netlify.com/domains-https/https-ssl/
- [W4] Netlify custom headers (`_headers`, `[[headers]]`): https://docs.netlify.com/manage/routing/headers/
- [W5] OWASP HTTP Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- [W6] html-validate: https://html-validate.org/
- [W7] lychee link checker action: https://github.com/lycheeverse/lychee-action
- [W8] Lighthouse CI configuration (`lighthouserc.json`, assertions, budgets): https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- [W9] WCAG 2.2: https://www.w3.org/TR/WCAG22/
- [W10] Netlify secrets scanning: https://docs.netlify.com/manage/security/secret-scanning/
- [C10] shipper README (`external` components): `shipper/README.md`

## Current gaps

MUST gaps from reading ideasquared-website on 2026-11-22 (live checks SITE-03 and SITE-04 not run).

| Repo                | Rule ID | What is missing                                                        |
| ------------------- | ------- | ---------------------------------------------------------------------- |
| ideasquared-website | SITE-01 | no `netlify.toml` (hosting config only in the Netlify UI)              |
| ideasquared-website | SITE-02 | no `ship.yaml`; deploys are Netlify's own Git auto-publish             |
| ideasquared-website | SITE-04 | no headers config in the repo (`netlify.toml` / `_headers`)            |
| ideasquared-website | SITE-06 | no `package.json` or CI workflow (no HTML validation or link check)    |
| ideasquared-website | SITE-07 | no Lighthouse CI                                                       |
