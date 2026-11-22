# Frontend standards (UI, accessibility, design systems)

Applies to repos of type `frontend` (see [README.md](README.md)), on top of [common.md](common.md) and the repo's
other type files: any repo that ships a user interface to customers or the public in a browser. A rule that names
React or a component library applies only where one exists; the static site's own accessibility gate (SITE-07)
counts for UI-02 there.

## Accessibility

**UI-01** · MUST · The product targets WCAG 2.2 level AA, and the repo says so in `CLAUDE.md` or
`docs/ACCESSIBILITY.md`. [U1]
Check: `git grep -n "WCAG 2.2 AA" -- CLAUDE.md .claude/CLAUDE.md docs/ACCESSIBILITY.md` finds a line.

**UI-02** · MUST · CI runs axe-core on every pull request and fails on any violation: on each shared component that
renders interactive UI (`vitest-axe` or equivalent) and on each top-level page or route (`@axe-core/playwright` in an
existing Playwright suite, otherwise the page rendered in Vitest), with the tags `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa` and `wcag22aa`. [U1][U2]
Check: a devDependency on `vitest-axe`, `jest-axe` or `@axe-core/playwright`; the axe calls set all five tags and
assert zero violations (`toHaveNoViolations()` or `expect(results.violations).toEqual([])`); every exported interactive
component and every top-level route or page has an axe test (or an entry in the UI-03 list); a CI workflow runs those
tests on `pull_request`.

**UI-03** · MUST · No axe rule is turned off globally. Known violations that cannot be fixed yet are listed in one file,
one entry per rule and component or page, each with a comment saying why; the list only shrinks. [U2]
Check: no `rules: { '<id>': { enabled: false } }` outside that one file; every entry in it has a comment.

**UI-04** · MUST · React repos lint JSX with `eslint-plugin-jsx-a11y` (`recommended` config or stricter). [U3]
Check: the ESLint config loads `jsx-a11y` and `pnpm lint` runs it over the apps and the component library.

**UI-05** · MUST · Every interactive element can be reached and used with the keyboard alone, in a logical order, with a
visible focus indicator (at least 3:1 contrast against its background); no positive `tabindex`; focus is never removed
without a replacement. Dialogs trap focus and return it on close. [U1][U4]
Check: `git grep -nE 'tabIndex=\{?"?[1-9]'` is empty; every `outline: 'none'` / `outline: none` sits beside a
`:focus-visible` style.

**UI-06** · MUST · Every input has a programmatic label; error messages are tied to their field
(`aria-describedby`), say what went wrong and how to fix it, and never rely on colour alone. [U1][U5]
Check: axe (UI-02) passes on every form; error text is in the DOM, not only a red border.

**UI-07** · MUST · Pointer targets are at least 24 by 24 CSS pixels, or have that much spacing (WCAG 2.5.8). [U1]
Check: the design system's button, icon-button, checkbox and link tokens give a minimum size of 24px or more.

**UI-08** · MUST · Non-essential animation and motion stop under `prefers-reduced-motion: reduce`. [U1][U6]
Check: a global reduced-motion rule exists, or each animation/transition style has the media query.

**UI-09** · MUST · Every HTML entry point sets `lang="en-GB"` (or the page's language) and a unique, descriptive
`<title>` per route. [U1]
Check: every published HTML file (`index.html`, `404.html` and any other page) has a non-empty `lang` attribute that
matches its content and a `<title>`; where the app has client-side routing, the router sets the document title per
route.

**UI-10** · MUST · Pages reflow to a 320 CSS pixel wide viewport with no horizontal scrolling and no lost content, and
text can be zoomed to 200%. [U1]
Check: at least one test or e2e journey per app runs at a 320px viewport; manual check in the monthly audit.

**UI-11** · SHOULD · A pull request that adds or changes a user journey is checked by hand with keyboard only and a
screen reader (VoiceOver or NVDA), and the PR template has a checkbox for it. [U4]
Check: the PR template has the checkbox.

## Design systems

**UI-12** · MUST · Each public product has a Design System artifact on claude.ai (tokens for colour in every theme,
type scale and fonts, spacing, radius; components with their states; guidelines), linked from the repo's `README.md`.
The artifact is the source of truth for the design; the code theme mirrors it. [U7]
Check: `README.md` links a `claude.ai/artifact/` Design System; the monthly UI audit compares its tokens with the code.

**UI-13** · MUST · Styles use design tokens only: no colour literals (`#hex`, `rgb(`, `hsl(`, named colours) and no
raw pixel spacing outside the theme file(s). [U7]
Check: across `*.css.ts`, `*.css`, `*.tsx` and `*.html` (including inline `style` attributes),
`git grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b[0-9]+px\b"` and a search for CSS named colours used as values
(e.g. `: red`, `color: 'white'`) find nothing outside the theme file(s) and tests.

**UI-14** · MUST · Every text/background token pair used together meets 4.5:1 contrast (3:1 for large text and
non-text UI such as borders, icons and focus rings), in every theme the product ships. [U1]
Check: a test computes the contrast of the declared token pairs, or the monthly audit records it.

**UI-15** · SHOULD · Apps build UI from the shared component library; a raw `<button>`, `<input>`, `<select>` or
`<textarea>` in an app is only used where the library has no equivalent. [U7]
Check: count of raw controls in `apps/` does not rise (a ratchet like adopt-dont-shop's `check:forms`).

**UI-16** · SHOULD · Every shared component documents its states (default, hover, focus, active, disabled, error,
loading) in the Design System artifact and has a test for each state that changes behaviour. [U7]
Check: the artifact's component page lists the states.

## UX baseline

**UI-17** · MUST · Every view that loads data shows a loading state, an empty state and an error state; none shows a
blank screen. Error states say what happened and what the person can do next. [U5][U8]
Check: each data-fetching page has tests for loading, empty and error.

**UI-18** · MUST · Destructive actions (delete, cancel a plan, remove a member) ask for confirmation or offer undo. [U8]
Check: the action's test covers the confirm or undo step.

**UI-19** · SHOULD · Copy is plain UK English, sentence case, with UK formats for dates, money, phone numbers and
postcodes. [U5]
Check: no US spellings in UI strings in the monthly audit; dates go through the shared formatter.

**UI-20** · SHOULD · Core Web Vitals at the 75th percentile meet LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1; CI runs
Lighthouse on the main pages with accessibility ≥ 0.95 (error) and performance ≥ 0.9 (warn). [U9][U10]
Check: a `lighthouserc.json` with those assertions runs in CI, or the monthly audit records the scores.

**UI-21** · SHOULD · The monthly UI audit reviews each product against Nielsen's ten usability heuristics and files
what it finds as fix PRs (small) or issues (large). [U8]
Check: the audit's report lists findings per heuristic.

## Sources

- [U1] WCAG 2.2: https://www.w3.org/TR/WCAG22/
- [U2] axe-core rule tags and configuration: https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
- [U3] eslint-plugin-jsx-a11y: https://github.com/jsx-eslint/eslint-plugin-jsx-a11y
- [U4] WAI-ARIA Authoring Practices Guide (keyboard, dialogs, focus): https://www.w3.org/WAI/ARIA/apg/
- [U5] GOV.UK Design System, error messages and accessibility: https://design-system.service.gov.uk/components/error-message/
- [U6] MDN, `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- [U7] Design tokens (W3C Design Tokens Community Group format): https://www.designtokens.org/
- [U8] Nielsen Norman Group, 10 usability heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- [U9] web.dev, Core Web Vitals thresholds: https://web.dev/articles/vitals
- [U10] Lighthouse CI configuration: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md

## Current gaps

Known on 22 Nov 2026; the first Consistency sweep run fills in the rest.

| Repo            | Rule  | Gap                                                                  |
| --------------- | ----- | -------------------------------------------------------------------- |
| adopt-dont-shop | UI-02 | no axe checks in CI (PR in progress)                                  |
| creatrgrid      | UI-02 | no axe checks in CI (PR in progress)                                  |
| pairflix        | UI-02 | no axe checks in CI (PR in progress)                                  |
| pairflix        | UI-12 | no Design System artifact                                             |
