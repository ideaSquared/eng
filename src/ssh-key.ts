// Every engineer gets the same SSH key path, and its public half on their GitHub account, so an admin can
// grant server access from https://github.com/<login>.keys. The private key never leaves the machine.
import { dirname } from 'node:path';
import type { Run } from './checks.ts';

export type SshKeyDeps = {
  keyPath: string;
  host: string;
  exists: (path: string) => boolean;
  read: (path: string) => string;
  mkdir: (path: string) => void;
  run: Run;
  live: (command: string, args: string[]) => boolean;
  log: (line: string) => void;
};

const SCOPE_ARGS = ['auth', 'refresh', '--hostname', 'github.com', '--scopes', 'admin:public_key'];

// The base64 key itself: the second field of a public key line. Comments and titles do not count.
const keyBody = (publicKey: string): string | undefined => publicKey.trim().split(/\s+/)[1];

export const isOnGitHub = (publicKey: string, listed: string): boolean => {
  const body = keyBody(publicKey);
  return body !== undefined && listed.split('\n').some((line) => line.split(/\s+/).includes(body));
};

const createKey = (deps: SshKeyDeps): boolean => {
  const pub = `${deps.keyPath}.pub`;
  if (deps.exists(pub)) return true;
  if (deps.exists(deps.keyPath)) {
    deps.log(`! ${deps.keyPath} has no public half. Recreate it with: ssh-keygen -y -f ${deps.keyPath} > ${pub}`);
    return false;
  }
  deps.log('\n→ Creating your SSH key (a passphrase is optional; with one, run ssh-add once after each restart)');
  deps.mkdir(dirname(deps.keyPath));
  return deps.live('ssh-keygen', ['-t', 'ed25519', '-f', deps.keyPath]);
};

// The account's public keys, one per line. `gh api` rather than `gh ssh-key list`, which exits non-zero for an
// account with no keys. gh needs the admin:public_key scope; ask for it once if reading fails.
const LIST_ARGS = ['api', 'user/keys', '--jq', '.[].key'];
const listKeys = (deps: SshKeyDeps): string | undefined => {
  const first = deps.run('gh', LIST_ARGS);
  if (first !== undefined) return first;
  deps.log('\n→ Allowing gh to add your public SSH key to your GitHub account');
  if (!deps.live('gh', SCOPE_ARGS)) return undefined;
  return deps.run('gh', LIST_ARGS);
};

export const ensureSshKey = (deps: SshKeyDeps): boolean => {
  if (!createKey(deps)) return false;
  const pub = `${deps.keyPath}.pub`;
  const listed = listKeys(deps);
  if (listed === undefined) {
    deps.log(`! Could not read your GitHub SSH keys. Run: gh ${SCOPE_ARGS.join(' ')}, then eng setup again.`);
    return false;
  }
  if (isOnGitHub(deps.read(pub), listed)) {
    deps.log('✓ SSH key: already on GitHub');
    return true;
  }
  deps.log('\n→ Adding your public SSH key to GitHub');
  return deps.live('gh', ['ssh-key', 'add', pub, '--title', `eng ${deps.host}`]);
};
