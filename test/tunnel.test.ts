import { describe, expect, it } from 'vitest';
import {
  expandHome,
  openTunnel,
  parseSettings,
  settingsPath,
  setupHint,
  sshArgs,
  TunnelError,
  type SpawnedProcess,
  type TunnelDeps,
  type TunnelTarget,
} from '../src/tunnel.ts';

const staging: TunnelTarget = { label: 'ADS staging', settingsKey: 'staging', remotePort: 4101, path: '/ops/v1' };
const prod: TunnelTarget = { label: 'ADS production', settingsKey: 'prod', remotePort: 4102, path: '/ops/v1' };

const CONFIG = JSON.stringify({
  currentEnv: 'staging',
  ssh: {
    staging: { host: 'stg.example.test', user: 'deploy', identityFile: '~/.ssh/ads_key' },
    prod: { host: 'prod.example.test', user: 'ops' },
  },
});

describe('where ops-cli keeps its settings', () => {
  it('uses XDG_CONFIG_HOME, else ~/.config, on Linux and macOS', () => {
    expect(settingsPath({ XDG_CONFIG_HOME: '/x' }, 'linux', '/home/a')).toBe('/x/ads-ops/config.json');
    expect(settingsPath({}, 'darwin', '/Users/a')).toBe('/Users/a/.config/ads-ops/config.json');
  });

  it('uses APPDATA, else AppData\\Roaming, on Windows', () => {
    expect(settingsPath({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32', 'C:\\Users\\a')).toBe('C:\\Users\\a\\AppData\\Roaming\\ads-ops\\config.json');
    expect(settingsPath({}, 'win32', 'C:\\Users\\a')).toBe('C:\\Users\\a\\AppData\\Roaming\\ads-ops\\config.json');
  });
});

describe('reading the settings', () => {
  it('picks the entry for the target and ignores the rest of the file', () => {
    expect(parseSettings(CONFIG, staging)).toEqual({ host: 'stg.example.test', user: 'deploy', identityFile: '~/.ssh/ads_key' });
    expect(parseSettings(CONFIG, prod)).toEqual({ host: 'prod.example.test', user: 'ops' });
  });

  it('is undefined for an absent entry, invalid JSON or an invalid shape', () => {
    expect(parseSettings(JSON.stringify({ ssh: { staging: { host: 'h', user: 'u' } } }), prod)).toBeUndefined();
    expect(parseSettings('not json', staging)).toBeUndefined();
    expect(parseSettings(JSON.stringify({ ssh: { staging: { host: '', user: 'u' } } }), staging)).toBeUndefined();
    expect(parseSettings('{}', staging)).toBeUndefined();
  });

  it('points to pnpm ops setup in one line', () => {
    expect(setupHint(staging)).toBe('No saved SSH settings for ADS staging. Run `pnpm ops setup` in adopt-dont-shop once.');
  });
});

describe('the ssh command', () => {
  it('forwards a local port to the remote loopback port, as an argument array', () => {
    expect(sshArgs({ host: 'h', user: 'u', identityFile: '~/.ssh/k' }, 15000, 4101, '/home/a', 'linux')).toEqual([
      '-N', '-L', '15000:127.0.0.1:4101',
      '-o', 'ExitOnForwardFailure=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30',
      '-i', '/home/a/.ssh/k', 'u@h',
    ]);
  });

  it('leaves out -i when no identity file is saved', () => {
    expect(sshArgs({ host: 'h', user: 'u' }, 1, 2, '/home/a', 'linux')).not.toContain('-i');
  });

  it('expands ~ in the identity file only', () => {
    expect(expandHome('~', '/h', 'linux')).toBe('/h');
    expect(expandHome('~/k', '/h', 'linux')).toBe('/h/k');
    expect(expandHome('/abs/~/k', '/h', 'linux')).toBe('/abs/~/k');
    expect(expandHome('~\\k', 'C:\\h', 'win32')).toBe('C:\\h\\k');
  });
});

type Fake = { deps: TunnelDeps; spawned: Array<{ command: string; args: readonly string[]; kills: number }>; clock: { t: number } };

const fake = (options: { config?: string | undefined; state?: SpawnedProcess['state']; listens?: boolean; listenAfterMs?: number } = {}): Fake => {
  const clock = { t: 0 };
  const spawned: Fake['spawned'] = [];
  const deps: TunnelDeps = {
    env: {},
    platform: 'linux',
    home: '/home/a',
    readFile: async () => ('config' in options ? options.config : CONFIG),
    spawn: (command, args) => {
      const record = { command, args, kills: 0 };
      spawned.push(record);
      return { kill: () => void (record.kills += 1), state: options.state ?? (() => 'running') };
    },
    freePort: async () => 15555,
    canConnect: async () => (options.listens ?? true) && clock.t >= (options.listenAfterMs ?? 0),
    sleep: async (ms) => void (clock.t += ms),
    now: () => clock.t,
    timeoutMs: 1000,
    intervalMs: 100,
  };
  return { deps, spawned, clock };
};

describe('opening a tunnel', () => {
  it('spawns ssh with the planned arguments and returns the local URL once the port accepts connections', async () => {
    const f = fake({ listenAfterMs: 300 });
    const tunnel = await openTunnel(staging, f.deps);
    expect(tunnel.url).toBe('http://127.0.0.1:15555/ops/v1');
    expect(f.spawned).toHaveLength(1);
    expect(f.spawned[0]?.command).toBe('ssh');
    expect(f.spawned[0]?.args).toEqual(sshArgs({ host: 'stg.example.test', user: 'deploy', identityFile: '~/.ssh/ads_key' }, 15555, 4101, '/home/a', 'linux'));
    expect(f.clock.t).toBe(300);
    expect(f.spawned[0]?.kills).toBe(0);
  });

  it('maps production to the prod settings and remote port', async () => {
    const f = fake();
    await openTunnel(prod, f.deps);
    expect(f.spawned[0]?.args).toContain('15555:127.0.0.1:4102');
    expect(f.spawned[0]?.args).toContain('ops@prod.example.test');
  });

  it('kills ssh when the tunnel is closed', async () => {
    const f = fake();
    const tunnel = await openTunnel(staging, f.deps);
    tunnel.close();
    expect(f.spawned[0]?.kills).toBe(1);
  });

  it('gives the setup hint and spawns nothing when the settings file or entry is missing', async () => {
    for (const config of [undefined, '{}', 'garbage']) {
      const f = fake({ config });
      await expect(openTunnel(staging, f.deps)).rejects.toThrow(setupHint(staging));
      expect(f.spawned).toEqual([]);
    }
  });

  it('times out with a clear error and kills ssh', async () => {
    const f = fake({ listens: false });
    const error = await openTunnel(staging, f.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TunnelError);
    expect((error as TunnelError).message).toBe('The SSH tunnel did not come up within 1s. Try `ssh deploy@stg.example.test` once by hand to accept the host key.');
    expect(f.spawned[0]?.kills).toBe(1);
    expect(f.clock.t).toBeGreaterThanOrEqual(1000);
  });

  it('fails early, and kills ssh, when ssh exits before the port opens', async () => {
    const f = fake({ listens: false, state: () => 'exited' });
    await expect(openTunnel(staging, f.deps)).rejects.toThrow('closed before it came up');
    expect(f.spawned[0]?.kills).toBe(1);
    expect(f.clock.t).toBe(0);
  });

  it('says OpenSSH is missing when ssh cannot be started', async () => {
    const f = fake({ listens: false, state: () => 'missing' });
    await expect(openTunnel(staging, f.deps)).rejects.toThrow('Is OpenSSH installed?');
    expect(f.spawned[0]?.kills).toBe(1);
  });

  it('never puts a key path or token in an error message', async () => {
    const f = fake({ listens: false });
    const error = await openTunnel(staging, f.deps).catch((e: unknown) => e);
    expect(String(error)).not.toContain('ads_key');
  });
});
