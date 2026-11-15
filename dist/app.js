import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// The eng app: a themed menu over eng, ship and idea. It only chooses; the CLI runs what was chosen.
import { Box, render, Text, useApp, useInput } from 'ink';
import { useMemo, useState } from 'react';
import { describeAction, homeMenu, isMenu, searchIndex, searchMenu } from "./menu.js";
import { envStyle } from "./session.js";
import { PALETTE } from "./theme.js";
const MAX_MATCHES = 8;
const Banner = ({ env }) => {
    const { color, badge } = envStyle(env);
    const production = env === 'production';
    return (_jsxs(Box, { children: [_jsx(Text, { color: production ? color : PALETTE.primary, bold: true, children: "\u25C6 idea" }), _jsx(Text, { color: production ? color : PALETTE.accent, bold: true, children: "Squared" }), _jsx(Text, { color: production ? color : PALETTE.muted, children: " \u00B7 eng " }), production ? (_jsx(Text, { backgroundColor: color, color: PALETTE.background, bold: true, children: ` ${badge} ` })) : (_jsx(Text, { color: color, bold: true, children: `[${badge}]` }))] }));
};
export const App = ({ env, onAction, menu = homeMenu(env) }) => {
    const { exit } = useApp();
    const [stack, setStack] = useState([menu]);
    const [cursor, setCursor] = useState(0);
    const current = stack[stack.length - 1] ?? menu;
    // undefined: search closed. While it is open, typed keys (q and the digits too) go to the text.
    const [search, setSearch] = useState(undefined);
    const [searchCursor, setSearchCursor] = useState(0);
    const index = useMemo(() => searchIndex(stack[0] ?? menu), [stack, menu]);
    const matches = search === undefined ? [] : searchMenu(index, search).slice(0, MAX_MATCHES);
    const edit = (text) => {
        setSearch(text);
        setSearchCursor(0);
    };
    const searchKey = (input, key, text) => {
        const last = matches.length - 1;
        if (key.escape)
            return setSearch(undefined);
        if (key.upArrow)
            return setSearchCursor(searchCursor <= 0 ? Math.max(last, 0) : searchCursor - 1);
        if (key.downArrow)
            return setSearchCursor(searchCursor >= last ? 0 : searchCursor + 1);
        if (key.return) {
            const entry = matches[searchCursor];
            return entry ? choose(entry.action) : undefined;
        }
        if (key.backspace || key.delete)
            return edit(text.slice(0, -1));
        if (input === '' || key.ctrl || key.meta || key.tab)
            return;
        edit(text + input);
    };
    const choose = (action) => {
        onAction(action);
        exit();
    };
    const select = (index) => {
        const item = current.items[index];
        if (!item)
            return;
        if (!isMenu(item.next))
            return choose(item.next);
        setStack([...stack, item.next]);
        setCursor(0);
    };
    const back = () => {
        if (stack.length === 1)
            return;
        setStack(stack.slice(0, -1));
        setCursor(0);
    };
    useInput((input, key) => {
        if (search !== undefined)
            return searchKey(input, key, search);
        if (input === '/')
            return edit('');
        const last = current.items.length - 1;
        if (key.upArrow || input === 'k')
            return setCursor(cursor === 0 ? last : cursor - 1);
        if (key.downArrow || input === 'j')
            return setCursor(cursor === last ? 0 : cursor + 1);
        if (key.return)
            return select(cursor);
        if (key.escape || key.leftArrow || key.backspace || key.delete)
            return back();
        if (input === 'q')
            return choose({ kind: 'quit' });
        const number = Number(input);
        if (number >= 1 && number <= current.items.length)
            select(number - 1);
    });
    const trail = stack.map((m) => m.title).join('  ›  ');
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: env === 'production' ? envStyle(env).color : PALETTE.primary, paddingX: 2, paddingY: 1, children: [_jsx(Banner, { env: env }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: env === 'production' ? envStyle(env).color : PALETTE.foreground, bold: true, children: trail }) }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: current.items.map((item, i) => {
                    const active = i === cursor;
                    return (_jsxs(Box, { children: [_jsx(Text, { color: PALETTE.accent, children: active ? '› ' : '  ' }), _jsx(Text, { color: PALETTE.muted, children: i < 9 ? `${i + 1} ` : '  ' }), _jsx(Text, { color: active ? PALETTE.primary : PALETTE.foreground, bold: active, children: item.label.padEnd(16) }), item.hint ? _jsx(Text, { color: PALETTE.muted, children: item.hint }) : null] }, item.label));
                }) }), search === undefined ? null : (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: PALETTE.accent, children: "/ " }), _jsx(Text, { color: PALETTE.foreground, children: search }), _jsx(Text, { color: PALETTE.accent, children: "\u258F" })] }), matches.length === 0 ? _jsx(Text, { color: PALETTE.muted, children: "  no match" }) : null, matches.map((entry, i) => (_jsxs(Box, { children: [_jsx(Text, { color: PALETTE.accent, children: i === searchCursor ? '› ' : '  ' }), _jsx(Text, { color: i === searchCursor ? PALETTE.primary : PALETTE.foreground, bold: i === searchCursor, children: entry.label.padEnd(24) }), _jsx(Text, { color: PALETTE.muted, children: describeAction(entry.action) })] }, entry.label)))] })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: PALETTE.muted, children: search === undefined
                        ? '↑↓ move · enter or 1-9 select · / search · esc back · q quit'
                        : 'type to filter · ↑↓ move · enter run · esc close search' }) })] }));
};
// Shows the app until something is chosen. Ctrl+C or q counts as quit.
export const chooseAction = async (env) => {
    const chosen = [];
    const instance = render(_jsx(App, { env: env, onAction: (action) => chosen.push(action) }));
    await instance.waitUntilExit();
    return chosen[0] ?? { kind: 'quit' };
};
