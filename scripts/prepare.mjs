// Installs the git hooks for contributors. A GitHub install (pnpm add -g github:ideaSquared/eng) has no dev
// dependencies and no .git folder, so a missing husky is not an error.
try {
  const { default: husky } = await import('husky');
  husky();
} catch {
  // not a development checkout
}
