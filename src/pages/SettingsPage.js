import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { SUPPORTED_CLIS } from '../ConfigManager.js';

const CLI_NAMES = {
  [SUPPORTED_CLIS.CLAUDE]: 'Claude Code',
  [SUPPORTED_CLIS.GEMINI]: 'Gemini Code Assist'
};

export default function SettingsPage({ availableCLIs }) {
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color={THEME.accentBright}>Settings</Text>
      <Box marginY={1} />

      <Box marginBottom={2} flexDirection="column">
        <Text color="gray" dimColor>Detected CLIs</Text>
        {availableCLIs.map((cli) => (
          <Box key={cli} flexDirection="row" marginTop={1}>
            <Text color="gray">  </Text>
            <Text color={THEME.fg}>{CLI_NAMES[cli]}</Text>
          </Box>
        ))}
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <Text color="gray" dimColor>Config Paths</Text>
        {availableCLIs.includes(SUPPORTED_CLIS.CLAUDE) && (
          <Text color="white" marginTop={1}>  ~/.claude.json</Text>
        )}
        {availableCLIs.includes(SUPPORTED_CLIS.GEMINI) && (
          <Text color="white">  ~/.gemini/settings.json</Text>
        )}
        <Text color="white">  ~/.claude-code-router/config.json</Text>
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <Text color="gray" dimColor>Manager</Text>
        <Text color="white" marginTop={1}>  ~/.gwyy_ms_Manager.json</Text>
        <Text color="white">  ~/.claude-backups/</Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray" dimColor>Version</Text>
        <Text color="white" marginTop={1}>  v1.1.0</Text>
      </Box>
    </Box>
  );
}
