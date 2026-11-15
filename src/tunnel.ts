// SSH tunnels for eng ops: products whose ops server is only reachable from the server's own loopback (ADS's
// service-ops). The planning is pure and tested; the node bits at the bottom (spawn, net) are thin. Nothing here
// prints a key or a token: errors name the user@host the person saved, as `pnpm ops` does, and never ssh's output.
import { spawn as spawnProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createServer, connect } from 'node:net';
import { z } from 'zod';

export class TunnelError extends Error {}

// Which saved ssh settings to use (adopt-dont-shop's `pnpm ops` calls its environments staging and prod), the port
// the server listens on at the remote loopback, and the ops contract's path on it.
export type TunnelTarget = { label: string; settingsKey: 'staging' | 'prod'; remotePort: number; path: string };

export type Tunnel = { url: string; close: () => void };

// ---- adopt-dont-shop's saved settings ------------------------------------------------------------------------
// `pnpm ops setup` (packages/ops-cli/src/store.ts) writes <config dir>/config.json:
//   { "currentEnv": "...", "ssh": { "staging": { "host", "user", "identityFile"? }, "prod": { ... } } }
// in %APPDATA%\ads-ops on Windows, else $XDG_CONFIG_HOME/ads-ops, else ~/.config/ads-ops.

const SshSettingsSchema = z.object({
  host: z.string().min(1),
  user: z.string().min(1),
  identityFile: z.string().min(1).optional(),
});
export type SshSettings = z.infer<typeof SshSettingsSchema>;

const OpsCliConfigSchema = z.object({
  ssh: z.object({ staging: SshSettingsSchema.optional(), prod: SshSettingsSchema.optional() }).default({}),
});

type Env = Readonly<Record<string, string | undefined>>;

export const settingsPath = (env: Env, platform: string, home: string): string => {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const base = platform === 'win32' ? (env.APPDATA ?? p.join(home, 'AppData', 'Roaming')) : env.XDG_CONFIG_HOME || p.join(home, '.config');
  return p.join(base, 'ads-ops', 'config.json');
};

export const setupHint = (target: TunnelTarget): string =>
  `No saved SSH settings for ${target.label}. Run \`pnpm ops setup\` in adopt-dont-shop once.`;

// undefined when the text is not valid config or has no entry for the target.
export const parseSettings = (text: string, target: TunnelTarget): SshSettings | undefined => {
  try {
    const parsed = OpsCliConfigSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.ssh[target.settingsKey] : undefined;
  } catch {
    return undefined;
  }
};

export const expandHome = (file: string, home: string, platform: string): string => {
  if (file === '~') return home;
  const sep = platform === 'win32' ? /^~[\\/]/ : /^~\//;
  return sep.test(file) ? (platform === 'win32' ? path.win32 : path.posix).join(home, file.slice(2)) : file;
};

// Like ops-cli's tunnel (-N, BatchMode, ExitOnForwardFailure, -i, user@host), on a local port eng picked, with a
// connect timeout so an unreachable host fails instead of hanging. ops-cli saves no ssh port, so there is no -p.
export const sshArgs = (settings: SshSettings, localPort: number, remotePort: number, home: string, platform: string): string[] => [
  '-N',
  '-L',
  `${String(localPort)}:127.0.0.1:${String(remotePort)}`,
  '-o',
  'ExitOnForwardFailure=yes',
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=10',
  '-o',
  'ServerAliveInterval=30',
  ...(settings.identityFile ? ['-i', expandHome(settings.identityFile, home, platform)] : []),
  `${settings.user}@${settings.host}`,
];

// ---- opening a tunnel ------------------------------------------------------------------------------------------

export type SpawnedProcess = {
  kill: () => void;
  // 'missing': the program could not be started (no ssh on PATH).
  state: () => 'running' | 'exited' | 'missing';
};

export type TunnelDeps = {
  env: Env;
  platform: string;
  home: string;
  readFile: (file: string) => Promise<string | undefined>;
  spawn: (command: string, args: readonly string[]) => SpawnedProcess;
  freePort: () => Promise<number>;
  canConnect: (port: number) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  intervalMs: number;
};

const waitForPort = async (port: number, proc: SpawnedProcess, hint: string, deps: TunnelDeps): Promise<void> => {
  const deadline = deps.now() + deps.timeoutMs;
  for (;;) {
    const state = proc.state();
    if (state === 'missing') throw new TunnelError('Could not start ssh. Is OpenSSH installed? (Windows 10+ has it as an optional feature.)');
    if (state === 'exited') throw new TunnelError(`The SSH tunnel closed before it came up. ${hint}`);
    if (await deps.canConnect(port)) return;
    if (deps.now() >= deadline) throw new TunnelError(`The SSH tunnel did not come up within ${String(Math.round(deps.timeoutMs / 1000))}s. ${hint}`);
    await deps.sleep(deps.intervalMs);
  }
};

// Opens the tunnel for the target and returns its base URL. close() ends the ssh process (safe to call twice); it
// is also called here when the tunnel does not come up, so a failed open never leaves ssh running.
export const openTunnel = async (target: TunnelTarget, deps: TunnelDeps): Promise<Tunnel> => {
  const text = await deps.readFile(settingsPath(deps.env, deps.platform, deps.home));
  const settings = text === undefined ? undefined : parseSettings(text, target);
  if (settings === undefined) throw new TunnelError(setupHint(target));
  const port = await deps.freePort();
  const proc = deps.spawn('ssh', sshArgs(settings, port, target.remotePort, deps.home, deps.platform));
  const hint = `Try \`ssh ${settings.user}@${settings.host}\` once by hand to accept the host key.`;
  try {
    await waitForPort(port, proc, hint, deps);
  } catch (error) {
    proc.kill();
    throw error;
  }
  return { url: `http://127.0.0.1:${String(port)}${target.path}`, close: () => proc.kill() };
};

// ---- node: the real spawn and sockets --------------------------------------------------------------------------

const live = new Set<() => void>();

// Ends every ssh process still running. Called when eng exits or is interrupted, so none is left behind.
export const killLiveTunnels = (): void => {
  [...live].forEach((kill) => kill());
  live.clear();
};

const nodeSpawn = (command: string, args: readonly string[]): SpawnedProcess => {
  // No shell: the arguments are an array. stdio is ignored so ssh cannot write over the picker.
  const child = spawnProcess(command, [...args], { stdio: 'ignore', windowsHide: true });
  let state: ReturnType<SpawnedProcess['state']> = 'running';
  child.on('error', () => (state = 'missing'));
  child.on('exit', () => state === 'running' && (state = 'exited'));
  const kill = () => {
    live.delete(kill);
    if (state === 'running') child.kill();
  };
  live.add(kill);
  return { kill, state: () => state };
};

const nodeFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (address !== null && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });

const nodeCanConnect = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => (socket.destroy(), resolve(false)));
  });

export const systemTunnelDeps = (env: Env = process.env): TunnelDeps => ({
  env,
  platform: process.platform,
  home: homedir(),
  readFile: (file) => readFile(file, 'utf8').catch(() => undefined),
  spawn: nodeSpawn,
  freePort: nodeFreePort,
  canConnect: nodeCanConnect,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  timeoutMs: 20_000,
  intervalMs: 150,
});
