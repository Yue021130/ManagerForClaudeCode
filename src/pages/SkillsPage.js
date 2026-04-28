import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';

export default function SkillsPage({ skills, selectedItem, selectedIndex, terminalWidth, terminalHeight }) {
  const skillsList = Object.keys(skills).sort();
  const skill = selectedItem ? skills[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.35);
  const contentHeight = terminalHeight - 5;
  const listVisible = Math.max(5, contentHeight);
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(listVisible / 2),
    Math.max(0, skillsList.length - listVisible)
  ));
  const visibleList = skillsList.slice(scrollOffset, scrollOffset + listVisible);

  return (
    <>
      <Box width={leftWidth} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Skills</Text>
          <Text color="gray">{'  '}{skillsList.length}</Text>
        </Box>
        {scrollOffset > 0 && <Text color="gray" dimColor>↑ {scrollOffset}</Text>}
        {visibleList.map((key, i) => {
          const realIdx = scrollOffset + i;
          const s = skills[key];
          const active = realIdx === selectedIndex;
          return (
            <Box key={key} flexDirection="row">
              <Text color={active ? THEME.infoBright : 'gray'}>{active ? '▸ ' : '  '}</Text>
              <Text color={active ? THEME.fg : s.disabled ? THEME.muted : THEME.fg} dimColor={s.disabled && !active} wrap="truncate">
                {s.name}
              </Text>
              <Box flexGrow={1} />
              <Text color={s.disabled ? THEME.muted : THEME.success}>{s.disabled ? '○' : '●'}</Text>
            </Box>
          );
        })}
        {scrollOffset + listVisible < skillsList.length && (
          <Text color="gray" dimColor>↓ {skillsList.length - scrollOffset - listVisible}</Text>
        )}
      </Box>

      <Box width={1} flexDirection="column" paddingY={1}>
        <Text color="gray">│</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="gray" dimColor>Details</Text>
        </Box>
        {skill ? (
          <Box flexDirection="column">
            <Text bold color={THEME.fg}>{skill.name}</Text>
            <Box marginY={1} flexDirection="row">
              <Text color="gray">Status </Text>
              {skill.disabled ? (
                <Text color={THEME.dangerBright}>Disabled</Text>
              ) : (
                <Text color={THEME.successBright}>Active</Text>
              )}
            </Box>
            <Text color="white">Version {skill.version}</Text>
            <Text color="gray">{skill.marketplace}</Text>
            {skill.installedAt && (
              <Text color="gray" dimColor>{new Date(skill.installedAt).toLocaleDateString()}</Text>
            )}
            <Box marginTop={1}>
              <Text color={THEME.warnBright}>▸ {skill.disabled ? 'Enable' : 'Disable'}</Text>
            </Box>
          </Box>
        ) : (
          <Text color="gray" dimColor>Select a skill</Text>
        )}
      </Box>
    </>
  );
}
