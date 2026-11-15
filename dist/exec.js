// Starts a command the same way on every platform. On Windows, global pnpm and npm commands are .cmd files,
// which only run through cmd.exe; passing them to cmd.exe directly avoids Node's shell option (DEP0190).
import { spawnSync } from 'node:child_process';
export const windowsCommand = (command, args) => [
    process.env.ComSpec ?? 'cmd.exe',
    ['/d', '/c', command, ...args],
];
export const spawn = (command, args, options) => {
    const [file, argv] = process.platform === 'win32' ? windowsCommand(command, args) : [command, [...args]];
    return spawnSync(file, argv, options);
};
const isReadHandle = (value) => typeof value === 'object' && value !== null && 'readStop' in value && typeof value.readStop === 'function';
// Hands the terminal to a child command. pause() alone leaves a TTY's read running (Node only stops it once its
// buffer is full), and on Windows switching a reading console to cooked mode queues a line read that takes the
// keys typed at the child's prompt. So stop the read first, through the handle Node uses for this itself, then
// turn raw mode off. Clearing `reading` lets a later resume() start reading again.
export const releaseTerminal = (stdin) => {
    const handle = Reflect.get(stdin, '_handle');
    if (isReadHandle(handle) && handle.reading) {
        handle.reading = false;
        handle.readStop();
    }
    stdin.pause();
    if (stdin.isTTY)
        stdin.setRawMode?.(false);
};
