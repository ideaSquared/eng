import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// The eng app: a themed menu over eng, ship and idea. It only chooses; the CLI runs what was chosen.
import { Box, render, Text, useApp, useInput } from 'ink';
import { useState } from 'react';
import { HOME, isMenu } from "./menu.js";
import { PALETTE } from "./theme.js";
const Banner = () => (_jsxs(Box, { children: [_jsx(Text, { color: PALETTE.primary, bold: true, children: "\u25C6 idea" }), _jsx(Text, { color: PALETTE.accent, bold: true, children: "Squared" }), _jsx(Text, { color: PALETTE.muted, children: " \u00B7 eng" })] }));
export const App = ({ onAction, menu = HOME }) => {
    const { exit } = useApp();
    const [stack, setStack] = useState([menu]);
    const [cursor, setCursor] = useState(0);
    const current = stack[stack.length - 1] ?? menu;
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
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: PALETTE.primary, paddingX: 2, paddingY: 1, children: [_jsx(Banner, {}), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: PALETTE.foreground, bold: true, children: trail }) }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: current.items.map((item, i) => {
                    const active = i === cursor;
                    return (_jsxs(Box, { children: [_jsx(Text, { color: PALETTE.accent, children: active ? '› ' : '  ' }), _jsx(Text, { color: PALETTE.muted, children: i < 9 ? `${i + 1} ` : '  ' }), _jsx(Text, { color: active ? PALETTE.primary : PALETTE.foreground, bold: active, children: item.label.padEnd(16) }), item.hint ? _jsx(Text, { color: PALETTE.muted, children: item.hint }) : null] }, item.label));
                }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: PALETTE.muted, children: "\u2191\u2193 move \u00B7 enter or 1-9 select \u00B7 esc back \u00B7 q quit" }) })] }));
};
// Shows the app until something is chosen. Ctrl+C or q counts as quit.
export const chooseAction = async () => {
    const chosen = [];
    const instance = render(_jsx(App, { onAction: (action) => chosen.push(action) }));
    await instance.waitUntilExit();
    return chosen[0] ?? { kind: 'quit' };
};
