#!/usr/bin/env bash
# eng installer for macOS, Linux and WSL (bash or zsh). Run:
#   curl -fsSL https://raw.githubusercontent.com/ideaSquared/eng/main/install.sh | bash
# It installs what eng needs (Node 24, pnpm, git, the GitHub CLI), then the eng CLI, then runs `eng setup`.
set -euo pipefail

say() { printf '\n→ %s\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }

node_ok() {
  has node && node -e 'const [a]=process.versions.node.split(".").map(Number);process.exit(a>=24?0:1)'
}

if ! node_ok; then
  say "Installing Node 24 with fnm"
  if ! has fnm; then
    if has brew; then brew install fnm; else curl -fsSL https://fnm.vercel.app/install | bash; fi
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
  fi
  eval "$(fnm env --shell bash)"
  # Homebrew does not add fnm to the shell profile, so do it here (once) for new terminals.
  case "$(basename "${SHELL:-bash}")" in zsh) profile="$HOME/.zshrc" ;; *) profile="$HOME/.bashrc" ;; esac
  # shellcheck disable=SC2016 # written to the profile as-is, to run in each new shell
  grep -qs 'fnm env' "$profile" || printf '\neval "$(fnm env --use-on-cd)"\n' >>"$profile"
  fnm install 24
  fnm default 24
  fnm use 24
fi

if ! has git; then
  if has brew; then
    say "Installing git"; brew install git
  elif has apt-get; then
    say "Installing git (needs sudo)"; sudo apt-get update && sudo apt-get install -y git
  else
    echo "Install git from https://git-scm.com/downloads, then run this again." >&2; exit 1
  fi
fi

if ! has gh; then
  if has brew; then
    say "Installing the GitHub CLI"; brew install gh
  elif has apt-get; then
    say "Installing the GitHub CLI (needs sudo)"
    sudo mkdir -p -m 755 /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
    sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
    sudo apt-get update && sudo apt-get install -y gh
  else
    echo "Install the GitHub CLI from https://cli.github.com, then run this again." >&2; exit 1
  fi
fi

pnpm_ok() { has pnpm && [ "$(pnpm --version | cut -d. -f1)" -ge 10 ]; }
if ! pnpm_ok; then
  say "Installing pnpm 10"
  npm install -g pnpm@10
fi

# pnpm needs a global bin folder on PATH; `pnpm setup` adds it to your shell profile for new terminals.
export PNPM_HOME="${PNPM_HOME:-$([ "$(uname)" = Darwin ] && echo "$HOME/Library/pnpm" || echo "$HOME/.local/share/pnpm")}"
export PATH="$PNPM_HOME:$PATH"
pnpm setup >/dev/null 2>&1 || true

say "Installing eng"
pnpm add -g github:ideaSquared/eng

# The script itself arrives on stdin, so give setup the terminal for the GitHub sign-in.
eng setup </dev/tty

echo
echo "Done. Open a new terminal so the PATH changes apply everywhere. Keep up to date with: eng update"
