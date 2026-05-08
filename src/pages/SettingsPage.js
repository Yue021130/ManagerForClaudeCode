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
        {claudeDetected ? (
          <Text color={THEME.success} marginTop={1}>  ● Claude Code</Text>
        ) : (
          <Text color={THEME.danger} marginTop={1}>  ○ Claude Code not found (~/.claude.json missing)</Text>
        )}
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Config Paths" />
        <Text color={THEME.fg} marginTop={1}>  ~/.claude.json</Text>
        <Text color={THEME.fg}>  ~/.claude/plugins/installed_plugins.json</Text>
        <Text color={THEME.fg}>  ~/.claude-code-router/config.json</Text>
      </Box>

      <Box flexDirection="column">
        <SectionHeader title="Backups" />
        <Text color={THEME.fg} marginTop={1}>  ~/.claude-backups/ (最近 10 份，每次写操作前自动备份)</Text>
      </Box>

      <Box flexDirection="column">
        <SectionHeader title="Version" />
        <Text color={THEME.fg} marginTop={1}>  v1.1.0</Text>
      </Box>
    </Box>
  );
}
