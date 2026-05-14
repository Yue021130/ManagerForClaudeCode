import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import SidebarLayout from '../components/SidebarLayout.js';
import ScrollableList from '../components/ScrollableList.js';
import DetailPanel from '../components/DetailPanel.js';
import StatusBadge from '../components/StatusBadge.js';
import ActionHint from '../components/ActionHint.js';
import SectionHeader from '../components/SectionHeader.js';

export default function SkillsPage({ skills, selectedItem, selectedIndex, terminalWidth, terminalHeight }) {
  const skillsList = Object.keys(skills).sort();
  const skill = selectedItem ? skills[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.32);

  return (
    <SidebarLayout
      leftWidth={leftWidth}
      leftContent={
        <ScrollableList
          title="Skills"
          items={skillsList}
          selectedIndex={selectedIndex}
          terminalHeight={terminalHeight}
          width={leftWidth}
          activeColor={THEME.infoBright}
          renderItem={(key, index, isActive) => {
            const s = skills[key];
            const disabled = s.disabled;
            const fg = isActive ? THEME.onAccent : disabled ? THEME.muted : THEME.fg;
            return (
              <>
                <Text bold={isActive} color={fg} dimColor={disabled && !isActive} wrap="truncate">
                  {s.name}
                </Text>
                <Box flexGrow={1} />
                <Text bold={isActive} color={isActive ? THEME.onAccent : disabled ? THEME.muted : THEME.success}>
                  {disabled ? '○' : '●'}
                </Text>
              </>
            );
          }}
        />
      }
      rightContent={
        <DetailPanel emptyMessage="Select a skill">
          {skill && (
            <Box flexDirection="column">
              <Text bold color={THEME.fg}>{skill.name}</Text>
              <Box marginTop={1} flexDirection="row">
                <Text color={THEME.muted}>Status </Text>
                <StatusBadge disabled={skill.disabled} />
              </Box>
              <Text color={THEME.fg}>Version {skill.version}</Text>
              <Text color={THEME.faint}>{skill.marketplace}</Text>
              {skill.installedAt && (
                <Text color={THEME.faint}>{new Date(skill.installedAt).toLocaleDateString()}</Text>
              )}
              <SectionHeader title="Actions" />
              <ActionHint label={skill.disabled ? 'Enable' : 'Disable'} />
            </Box>
          )}
        </DetailPanel>
      }
    />
  );
}
