// Starts a command the same way on every platform. On Windows, global pnpm and npm commands are .cmd files,
// which only run through cmd.exe; passing them to cmd.exe directly avoids Node's shell option (DEP0190).
import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from 'node:child_process';

export const windowsCommand = (command: string, args: readonly string[]): [string, string[]] => [
  process.env.ComSpec ?? 'cmd.exe',
  ['/d', '/c', command, ...args],
];

export const spawn = (command: string, args: readonly string[], options: SpawnSyncOptions): SpawnSyncReturns<string | Buffer> => {
  const [file, argv] = process.platform === 'win32' ? windowsCommand(command, args) : [command, [...args]];
  return spawnSync(file, argv, options);
};
