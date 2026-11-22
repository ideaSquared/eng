// The eng app: a themed menu over eng, ship and idea. It only chooses; the CLI runs what was chosen.
import { Box, render, Text, useApp, useInput, type Key } from 'ink';
import { useMemo, useState } from 'react';
import { describeAction, homeMenu, isMenu, searchIndex, searchMenu, type Action, type Menu } from './menu.ts';
import { envStyle, type Environment } from './session.ts';
import { PALETTE } from './theme.ts';

const MAX_MATCHES = 8;

type Props = { env: Environment; onAction: (action: Action) => void; menu?: Menu };

const Banner = ({ env }: { env: Environment }) => {
  const { color, badge } = envStyle(env);
  const production = env === 'production';
  return (
    <Box>
      <Text color={production ? color : PALETTE.primary} bold>
        ◆ idea
      </Text>
      <Text color={production ? color : PALETTE.accent} bold>
        Squared
      </Text>
      <Text color={production ? color : PALETTE.muted}> · eng </Text>
      {production ? (
        <Text backgroundColor={color} color={PALETTE.background} bold>
          {` ${badge} `}
        </Text>
      ) : (
        <Text color={color} bold>
          {`[${badge}]`}
        </Text>
      )}
    </Box>
  );
};

export const App = ({ env, onAction, menu = homeMenu(env) }: Props) => {
  const { exit } = useApp();
  const [stack, setStack] = useState<readonly Menu[]>([menu]);
  const [cursor, setCursor] = useState(0);
  const current = stack[stack.length - 1] ?? menu;
  // undefined: search closed. While it is open, typed keys (q and the digits too) go to the text.
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [searchCursor, setSearchCursor] = useState(0);
  const index = useMemo(() => searchIndex(stack[0] ?? menu), [stack, menu]);
  const matches = search === undefined ? [] : searchMenu(index, search).slice(0, MAX_MATCHES);

  const edit = (text: string) => {
    setSearch(text);
    setSearchCursor(0);
  };

  const searchKey = (input: string, key: Key, text: string) => {
    const last = matches.length - 1;
    if (key.escape) return setSearch(undefined);
    if (key.upArrow) return setSearchCursor(searchCursor <= 0 ? Math.max(last, 0) : searchCursor - 1);
    if (key.downArrow) return setSearchCursor(searchCursor >= last ? 0 : searchCursor + 1);
    if (key.return) {
      const entry = matches[searchCursor];
      return entry ? choose(entry.action) : undefined;
    }
    if (key.backspace || key.delete) return edit(text.slice(0, -1));
    if (input === '' || key.ctrl || key.meta || key.tab) return;
    edit(text + input);
  };

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
    if (search !== undefined) return searchKey(input, key, search);
    if (input === '/') return edit('');
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
    <Box flexDirection="column" borderStyle="round" borderColor={env === 'production' ? envStyle(env).color : PALETTE.primary} paddingX={2} paddingY={1}>
      <Banner env={env} />
      <Box marginTop={1}>
        <Text color={env === 'production' ? envStyle(env).color : PALETTE.foreground} bold>
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
      {search === undefined ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={PALETTE.accent}>/ </Text>
            <Text color={PALETTE.foreground}>{search}</Text>
            <Text color={PALETTE.accent}>▏</Text>
          </Box>
          {matches.length === 0 ? <Text color={PALETTE.muted}> no match</Text> : null}
          {matches.map((entry, i) => (
            <Box key={entry.label}>
              <Text color={PALETTE.accent}>{i === searchCursor ? '› ' : '  '}</Text>
              <Text color={i === searchCursor ? PALETTE.primary : PALETTE.foreground} bold={i === searchCursor}>
                {entry.label.padEnd(24)}
              </Text>
              <Text color={PALETTE.muted}>{describeAction(entry.action)}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={PALETTE.muted}>
          {search === undefined ? '↑↓ move · enter or 1-9 select · / search · esc back · q quit' : 'type to filter · ↑↓ move · enter run · esc close search'}
        </Text>
      </Box>
    </Box>
  );
};

// Shows the app until something is chosen. Ctrl+C or q counts as quit.
export const chooseAction = async (env: Environment): Promise<Action> => {
  const chosen: Action[] = [];
  const instance = render(<App env={env} onAction={(action) => chosen.push(action)} />);
  await instance.waitUntilExit();
  return chosen[0] ?? { kind: 'quit' };
};
