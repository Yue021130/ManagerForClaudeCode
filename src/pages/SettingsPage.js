import React from 'react';
import { Box, Text } from 'ink';
import { THEME } from '../theme.js';
import { SUPPORTED_CLIS } from '../ConfigManager.js';
import { CLI_NAMES } from '../constants/cliNames.js';
import SectionHeader from '../components/SectionHeader.js';

export default function SettingsPage({ availableCLIs }) {
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={THEME.accentBright}>Settings</Text>
      <Box marginY={1} />

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Detected CLIs" />
        {availableCLIs.map((cli) => (
          <Box key={cli} flexDirection="row" marginTop={1}>
            <Text color={THEME.fg}>{CLI_NAMES[cli]}</Text>
          </Box>
        ))}
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Config Paths" />
        {availableCLIs.includes(SUPPORTED_CLIS.CLAUDE) && (
          <Text color={THEME.fg} marginTop={1}>  ~/.claude.json</Text>
        )}
        {availableCLIs.includes(SUPPORTED_CLIS.GEMINI) && (
          <Text color={THEME.fg}>  ~/.gemini/settings.json</Text>
        )}
        <Text color={THEME.fg}>  ~/.claude-code-router/config.json</Text>
      </Box>

      <Box marginBottom={2} flexDirection="column">
        <SectionHeader title="Manager" />
        <Text color={THEME.fg} marginTop={1}>  ~/.gwyy_ms_Manager.json</Text>
        <Text color={THEME.fg}>  ~/.claude-backups/</Text>
      </Box>

      <Box flexDirection="column">
        <SectionHeader title="Version" />
        <Text color={THEME.fg} marginTop={1}>  v1.1.0</Text>
      </Box>
    </Box>
  );
}
