// The eng app: a themed menu over eng, ship and idea. It only chooses; the CLI runs what was chosen.
import { Box, render, Text, useApp, useInput } from 'ink';
import { useState } from 'react';
import { HOME, isMenu, type Action, type Menu } from './menu.ts';
import { PALETTE } from './theme.ts';

type Props = { onAction: (action: Action) => void; menu?: Menu };

const Banner = () => (
  <Box>
    <Text color={PALETTE.primary} bold>
      ◆ idea
    </Text>
    <Text color={PALETTE.accent} bold>
      Squared
    </Text>
    <Text color={PALETTE.muted}> · eng</Text>
  </Box>
);

export const App = ({ onAction, menu = HOME }: Props) => {
  const { exit } = useApp();
  const [stack, setStack] = useState<readonly Menu[]>([menu]);
  const [cursor, setCursor] = useState(0);
  const current = stack[stack.length - 1] ?? menu;

  const choose = (action: Action) => {
    onAction(action);
    exit();
  };

  const select = (index: number) => {
    const item = current.items[index];
    if (!item) return;
    if (!isMenu(item.next)) return choose(item.next);
    setStack([...stack, item.next]);
    setCursor(0);
  };

  const back = () => {
    if (stack.length === 1) return;
    setStack(stack.slice(0, -1));
    setCursor(0);
  };

  useInput((input, key) => {
    const last = current.items.length - 1;
    if (key.upArrow || input === 'k') return setCursor(cursor === 0 ? last : cursor - 1);
    if (key.downArrow || input === 'j') return setCursor(cursor === last ? 0 : cursor + 1);
    if (key.return) return select(cursor);
    if (key.escape || key.leftArrow || key.backspace || key.delete) return back();
    if (input === 'q') return choose({ kind: 'quit' });
    const number = Number(input);
    if (number >= 1 && number <= current.items.length) select(number - 1);
  });

  const trail = stack.map((m) => m.title).join('  ›  ');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.primary} paddingX={2} paddingY={1}>
      <Banner />
      <Box marginTop={1}>
        <Text color={PALETTE.foreground} bold>
          {trail}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {current.items.map((item, i) => {
          const active = i === cursor;
          return (
            <Box key={item.label}>
              <Text color={PALETTE.accent}>{active ? '› ' : '  '}</Text>
              <Text color={PALETTE.muted}>{i < 9 ? `${i + 1} ` : '  '}</Text>
              <Text color={active ? PALETTE.primary : PALETTE.foreground} bold={active}>
                {item.label.padEnd(16)}
              </Text>
              {item.hint ? <Text color={PALETTE.muted}>{item.hint}</Text> : null}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={PALETTE.muted}>↑↓ move · enter or 1-9 select · esc back · q quit</Text>
      </Box>
    </Box>
  );
};

// Shows the app until something is chosen. Ctrl+C or q counts as quit.
export const chooseAction = async (): Promise<Action> => {
  const chosen: Action[] = [];
  const instance = render(<App onAction={(action) => chosen.push(action)} />);
  await instance.waitUntilExit();
  return chosen[0] ?? { kind: 'quit' };
};
