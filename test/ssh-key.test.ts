import { describe, expect, it } from 'vitest';
import { ensureSshKey, isOnGitHub, type SshKeyDeps } from '../src/ssh-key.ts';

const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMine me@laptop\n';
const LISTED = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMine\n';
const OTHER = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOther\n';

type Fake = {
  files?: Record<string, string>;
  // Successive outputs of `gh api user/keys`; undefined is a failure (e.g. a missing scope).
  lists?: Array<string | undefined>;
  failLive?: string[];
};

const fake = ({ files = {}, lists = [], failLive = [] }: Fake) => {
  const disk = new Map(Object.entries(files));
  const queue = [...lists];
  const calls: string[] = [];
  const logs: string[] = [];
  const deps: SshKeyDeps = {
    keyPath: '/home/me/.ssh/id_ed25519',
    host: 'laptop',
    exists: (path) => disk.has(path),
    read: (path) => disk.get(path) ?? '',
    mkdir: (path) => void calls.push(`mkdir ${path}`),
    run: (command, args) => {
      calls.push(`run ${command} ${args.join(' ')}`);
      return queue.shift();
    },
    live: (command, args) => {
      const line = `${command} ${args.join(' ')}`;
      calls.push(`live ${line}`);
      if (failLive.some((f) => line.startsWith(f))) return false;
      if (command === 'ssh-keygen') disk.set('/home/me/.ssh/id_ed25519.pub', PUB);
      return true;
    },
    log: (line) => void logs.push(line),
  };
  return { deps, calls, logs };
};

describe('finding a public key on GitHub', () => {
  it('matches on the key itself, not the comment or title', () => {
    expect(isOnGitHub(PUB, LISTED)).toBe(true);
    expect(isOnGitHub('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMine someone-else\n', LISTED)).toBe(true);
    expect(isOnGitHub(PUB, OTHER)).toBe(false);
    expect(isOnGitHub(PUB, '')).toBe(false);
    expect(isOnGitHub('', LISTED)).toBe(false);
  });
});

describe('ensureSshKey', () => {
  it('creates the key when there is none, then uploads the public half', () => {
    const { deps, calls } = fake({ lists: [OTHER] });
    expect(ensureSshKey(deps)).toBe(true);
    expect(calls).toEqual([
      'mkdir /home/me/.ssh',
      'live ssh-keygen -t ed25519 -f /home/me/.ssh/id_ed25519',
      'run gh api user/keys --jq .[].key',
      'live gh ssh-key add /home/me/.ssh/id_ed25519.pub --title eng laptop',
    ]);
  });

  it('keeps an existing key and does nothing when GitHub already has it', () => {
    const { deps, calls, logs } = fake({ files: { '/home/me/.ssh/id_ed25519.pub': PUB }, lists: [LISTED] });
    expect(ensureSshKey(deps)).toBe(true);
    expect(calls).toEqual(['run gh api user/keys --jq .[].key']);
    expect(logs.join('\n')).toContain('already on GitHub');
  });

  it('asks gh for the key permission once when it cannot list keys, then carries on', () => {
    const { deps, calls } = fake({ files: { '/home/me/.ssh/id_ed25519.pub': PUB }, lists: [undefined, OTHER] });
    expect(ensureSshKey(deps)).toBe(true);
    expect(calls).toEqual([
      'run gh api user/keys --jq .[].key',
      'live gh auth refresh --hostname github.com --scopes admin:public_key',
      'run gh api user/keys --jq .[].key',
      'live gh ssh-key add /home/me/.ssh/id_ed25519.pub --title eng laptop',
    ]);
  });

  it('uploads to an account that has no keys yet', () => {
    const { deps, calls } = fake({ files: { '/home/me/.ssh/id_ed25519.pub': PUB }, lists: [''] });
    expect(ensureSshKey(deps)).toBe(true);
    expect(calls).toEqual([
      'run gh api user/keys --jq .[].key',
      'live gh ssh-key add /home/me/.ssh/id_ed25519.pub --title eng laptop',
    ]);
  });

  it('stops without uploading when the permission is refused', () => {
    const { deps, calls, logs } = fake({
      files: { '/home/me/.ssh/id_ed25519.pub': PUB },
      lists: [undefined],
      failLive: ['gh auth refresh'],
    });
    expect(ensureSshKey(deps)).toBe(false);
    expect(calls.some((c) => c.includes('ssh-key add'))).toBe(false);
    expect(logs.join('\n')).toContain('gh auth refresh --hostname github.com --scopes admin:public_key');
  });

  it('never overwrites a private key that has lost its public half', () => {
    const { deps, calls, logs } = fake({ files: { '/home/me/.ssh/id_ed25519': 'PRIVATE' } });
    expect(ensureSshKey(deps)).toBe(false);
    expect(calls).toEqual([]);
    expect(logs.join('\n')).toContain('ssh-keygen -y -f /home/me/.ssh/id_ed25519');
  });

  it('stops when creating the key fails', () => {
    const { deps, calls } = fake({ failLive: ['ssh-keygen'] });
    expect(ensureSshKey(deps)).toBe(false);
    expect(calls.some((c) => c.startsWith('run gh'))).toBe(false);
  });

  it('never prints the private key', () => {
    const { deps, logs } = fake({ files: { '/home/me/.ssh/id_ed25519.pub': PUB }, lists: [OTHER] });
    deps.read = (path) => (path.endsWith('.pub') ? PUB : 'PRIVATE KEY');
    ensureSshKey(deps);
    expect(logs.join('\n')).not.toContain('PRIVATE');
  });
});
