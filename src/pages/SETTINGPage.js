import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import SectionHeader from '../components/SectionHeader.js';

export default function SettingsPage({ claudeDetected }) {
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={THEME.accentBright}>Settings</Text>
      <Box marginY={1} />

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Detected CLI" />
        <Box marginTop={1} flexDirection="row">
          {claudeDetected ? (
            <>
              <Text bold color={THEME.onAccent} backgroundColor={THEME.success}> OK </Text>
              <Text> </Text>
              <Text color={THEME.fg}>Claude Code</Text>
            </>
          ) : (
            <>
              <Text bold color={THEME.onAccent} backgroundColor={THEME.danger}> MISSING </Text>
              <Text> </Text>
              <Text color={THEME.muted}>~/.claude.json not found</Text>
            </>
          )}
        </Box>
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Config Paths" />
        <Box marginTop={1} flexDirection="column">
          {[
            '~/.claude.json',
            '~/.claude/plugins/installed_plugins.json',
            '~/.claude-code-router/config.json'
          ].map(p => (
            <Text key={p}>
              <Text color={THEME.accent}>{'  • '}</Text>
              <Text color={THEME.fg}>{p}</Text>
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Backups" />
        <Text>
          <Text color={THEME.accent}>{'  • '}</Text>
          <Text color={THEME.fg}>~/.claude-backups/</Text>
          <Text color={THEME.faint}>{'  最近 10 份 · 每次写操作前自动备份'}</Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        <SectionHeader title="Version" />
        <Box marginTop={1} flexDirection="row">
          <Text bold color={THEME.onAccent} backgroundColor={THEME.chipBg}> v1.1.0 </Text>
        </Box>
      </Box>
    </Box>
  );
}
