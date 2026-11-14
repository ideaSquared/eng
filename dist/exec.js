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
