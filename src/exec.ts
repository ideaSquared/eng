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

type Terminal = { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown; pause: () => unknown };
type ReadHandle = { reading: boolean; readStop: () => unknown; readStart: () => unknown };

const isReadHandle = (value: unknown): value is ReadHandle =>
  typeof value === 'object' &&
  value !== null &&
  'readStop' in value &&
  typeof value.readStop === 'function' &&
  'readStart' in value &&
  typeof value.readStart === 'function';

// Hands the terminal to a child command. pause() alone leaves a TTY's read running (Node only stops it once its
// buffer is full), and on Windows switching a reading console to cooked mode queues a line read that takes the
// keys typed at the child's prompt. So stop the read first, through the handle Node uses for this itself, then
// turn raw mode off. Clearing `reading` lets a later resume() start reading again.
export const releaseTerminal = (stdin: Terminal): void => {
  const handle: unknown = Reflect.get(stdin, '_handle');
  if (isReadHandle(handle) && handle.reading) {
    handle.reading = false;
    handle.readStop();
  }
  stdin.pause();
  if (stdin.isTTY) stdin.setRawMode?.(false);
};

// Takes the terminal back once the child has finished. The stream still thinks the read releaseTerminal stopped is
// pending, so resume() alone never starts another and Node exits with nothing left to wait for. Restart it the way
// Node does (reading = true, then readStart).
export const reclaimTerminal = (stdin: Terminal): void => {
  const handle: unknown = Reflect.get(stdin, '_handle');
  if (!isReadHandle(handle) || handle.reading) return;
  handle.reading = true;
  handle.readStart();
};
