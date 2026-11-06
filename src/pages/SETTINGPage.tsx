import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PageMeta } from '../types.js';
import { useShell } from '../shell/context.js';
import { loadConfig, saveConfig } from '../config.js';

/**
 * SETTING 页 — 应用设置（存 ~/.mfcc/config.json，见 config.ts）
 *
 * 目前一项：恢复会话「新开终端窗口」的终端命令模板。
 * enter 进入编辑（行内编辑，风格同重命名输入框），enter 保存、esc 取消、留空 = 恢复自动。
 * 占位符：{cwd} = 会话项目目录，{cmd} = 恢复命令。
 */
export const meta: PageMeta = {
  num: 3,
  label: 'SETTING',
  color: '#ed0c0c',
  hints: [
    ['enter', '编辑'],
    ['esc', '取消']
  ]
};

const EXAMPLES = [
  ['Windows Terminal', 'wt -d "{cwd}" cmd /k {cmd}'],
  ['系统控制台 conhost', 'cmd /c start "" /D "{cwd}" cmd /k {cmd}'],
  ['PowerShell 7', 'wt -d "{cwd}" pwsh -NoExit -Command {cmd}']
] as const;

export default function SETTINGPage() {
  const { setMessage, setError, setKeysEnabled } = useShell();
  const [tpl, setTpl] = useState(() => loadConfig().terminalTemplate);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');

  useInput((ch, key) => {
    if (!editing) {
      if (key.return) {
        setEditing(true);
        setInput(tpl);
        setKeysEnabled(false); // 编辑时数字键不切页、Esc 不退出
      }
      return;
    }
    if (key.escape) {
      setEditing(false);
      setKeysEnabled(true);
      return;
    }
    if (key.return) {
      const v = input.trim();
      try {
        saveConfig({ terminalTemplate: v });
        setTpl(v);
        setMessage(v ? '终端模板已保存' : '已恢复自动选择终端（wt → cmd）');
      } catch (e) {
        setError(`保存失败: ${String(e)}`);
      }
      setEditing(false);
      setKeysEnabled(true);
      return;
    }
    // Backspace 两种字节都收：\b→key.backspace、\x7f→key.delete（同重命名弹窗）
    if (key.backspace || key.delete) return setInput(s => s.slice(0, -1));
    if (!key.ctrl && !key.meta && ch) return setInput(s => s + ch);
  });

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="#E6EDF3">恢复会话 · 新窗口终端</Text>
      </Box>
      <Box>
        <Text color="#8B949E">当前：</Text>
        <Text color={tpl ? '#E6EDF3' : '#8B949E'} wrap="truncate">
          {tpl || '自动（Windows Terminal → cmd）'}
        </Text>
      </Box>
      {editing ? (
        <>
          <Box marginTop={1}>
            <Text color="#E3B341">❯ </Text>
            <Text backgroundColor="#21262D">
              <Text color="#E6EDF3">{` ${input}`}</Text>
              <Text color="#E3B341">_</Text>
              <Text>{' '}</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="#8B949E">{'留空保存 = 恢复自动 · enter 保存 · esc 取消'}</Text>
          </Box>
        </>
      ) : (
        <Box marginTop={1}>
          <Text color="#8B949E">enter 编辑 · 留空 = 自动</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text color="#6E7681">{'占位符：{cwd} = 会话项目目录 · {cmd} = 恢复命令（claude --resume <id>）'}</Text>
        {EXAMPLES.map(([name, cmd]) => (
          <Text key={name} color="#6E7681">{`${name}：${name.length > 12 ? '' : '  '}${cmd}`}</Text>
        ))}
      </Box>
    </Box>
  );
}
