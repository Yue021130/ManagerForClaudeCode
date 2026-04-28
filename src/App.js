import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConfigManager, SUPPORTED_CLIS } from './ConfigManager.js';
import { ManagerConfig } from './ManagerConfig.js';
import { CcrConfigManager, ROUTER_RULES } from './CcrConfigManager.js';

const PAGES = {
  MCP: 'mcp',
  SKILLS: 'skills',
  TRASH: 'trash',
  CCR: 'ccr',
  SETTINGS: 'settings'
};

const MCP_WINDOWS = {
  LIST: 0,
  DETAILS: 1,
  PARAMS: 2
};

const CLI_NAMES = {
  [SUPPORTED_CLIS.CLAUDE]: 'Claude Code',
  [SUPPORTED_CLIS.GEMINI]: 'Gemini Code Assist'
};

// ─── 页面主题色配置 ─────────────────────────────────────────────────────────
const PAGE_THEMES = {
  [PAGES.MCP]:      { accent: 'green',        bright: 'brightGreen',  icon: '◆' },
  [PAGES.SKILLS]:   { accent: 'blue',         bright: 'brightBlue',   icon: '◇' },
  [PAGES.TRASH]:    { accent: 'red',          bright: 'brightRed',    icon: '▪' },
  [PAGES.CCR]:      { accent: 'magenta',      bright: 'brightMagenta',icon: '◈' },
  [PAGES.SETTINGS]: { accent: 'cyan',         bright: 'brightCyan',   icon: '◉' }
};

const SENSITIVE_RE = /token|key|secret|auth|password|bearer|credential/i;
function maskValue(k, v) {
  const s = String(v);
  if (SENSITIVE_RE.test(k)) return s.slice(0, 4) + '***';
  return s.length > 32 ? s.slice(0, 32) + '…' : s;
}

function maskApiKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// ─── 状态图标 ──────────────────────────────────────────────────────────────
const ICONS = {
  enabled:  '🟢',
  disabled: '🔴',
  neutral:  '⚪',
  selected: '▸',
  unselected: ' ',
  arrow:    '→',
  check:    '✓',
  cross:    '✗',
  dot:      '●',
  dotEmpty: '○'
};

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [page, setPage] = useState(PAGES.MCP);
  const [activeWindow, setActiveWindow] = useState(MCP_WINDOWS.LIST);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cliSelectedIndex, setCliSelectedIndex] = useState(0);
  const [detailMenuIndex, setDetailMenuIndex] = useState(0);

  const [configManager, setConfigManager] = useState(null);
  const [managerConfig, setManagerConfig] = useState(null);
  const [ccrManager, setCcrManager] = useState(null);
  const [availableCLIs, setAvailableCLIs] = useState([]);
  const [mcpServers, setMcpServers] = useState({});
  const [skills, setSkills] = useState({});
  const [trash, setTrash] = useState({});
  const [ccrData, setCcrData] = useState({ providers: [], router: {} });

  const [ccrActiveWindow, setCcrActiveWindow] = useState(0);
  const [ccrSelectedProvider, setCcrSelectedProvider] = useState(0);
  const [ccrSelectedRouterRule, setCcrSelectedRouterRule] = useState(0);
  const [ccrShowKeys, setCcrShowKeys] = useState(false);
  const [ccrEditMode, setCcrEditMode] = useState(false);
  const [ccrEditSelected, setCcrEditSelected] = useState(0);

  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    try {
      const manager = new ConfigManager();
      const mConfig = new ManagerConfig();
      const ccr = new CcrConfigManager();
      setConfigManager(manager);
      setManagerConfig(mConfig);
      setCcrManager(ccr);
      setAvailableCLIs(manager.getAvailableCLIs());
      setMcpServers(manager.getMcpServers());
      setSkills(manager.getSkills());
      setTrash(mConfig.getTrash());
      refreshCcrData(ccr);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refreshData = () => {
    if (configManager && managerConfig) {
      configManager.reload();
      setMcpServers(configManager.getMcpServers());
      setSkills(configManager.getSkills());
      setTrash(managerConfig.getTrash());
    }
    if (ccrManager) {
      refreshCcrData(ccrManager);
    }
  };

  const refreshCcrData = (manager = ccrManager) => {
    if (!manager) return;
    manager.reload();
    setCcrData({
      providers: manager.getProviders(),
      router: manager.getRouter()
    });
  };

  const getCurrentList = () => {
    switch (page) {
      case PAGES.MCP: return Object.keys(mcpServers).sort();
      case PAGES.SKILLS: return Object.keys(skills).sort();
      case PAGES.TRASH: return Object.keys(trash).sort();
      case PAGES.CCR: return ccrData.providers.map(p => p.name);
      default: return [];
    }
  };

  const currentList = getCurrentList();
  const selectedItem = currentList[selectedIndex];

  const getDetailMenu = (name) => {
    if (!name || !mcpServers[name]) return [];
    const serverInfo = mcpServers[name];
    const firstCli = Object.keys(serverInfo.clis)[0];
    const isDisabled = serverInfo.clis[firstCli]?.config?.disabled;
    const items = [];
    if (availableCLIs.length > 1) items.push({ label: 'Sync to all CLIs', action: 'sync' });
    items.push({ label: 'Delete (move to trash)', action: 'delete' });
    items.push({ label: isDisabled ? 'Enable' : 'Disable', action: 'toggle' });
    return items;
  };

  const detailMenu = getDetailMenu(selectedItem);

  useInput((input, key) => {
    if (message) setMessage(null);
    if (error) setError(null);

    if (input === 'q') { exit(); return; }

    if (key.tab || key.leftArrow || key.rightArrow) {
      if (page === PAGES.MCP) {
        if (key.leftArrow) {
          setActiveWindow(prev => prev === 0 ? MCP_WINDOWS.PARAMS : prev - 1);
        } else {
          setActiveWindow(prev => (prev + 1) % 3);
        }
      } else if (page === PAGES.CCR) {
        if (ccrEditMode) return;
        if (key.leftArrow) {
          setCcrActiveWindow(prev => prev === 0 ? 2 : prev - 1);
        } else {
          setCcrActiveWindow(prev => (prev + 1) % 3);
        }
      }
      return;
    }

    if (input === '1') { setPage(PAGES.MCP); setActiveWindow(MCP_WINDOWS.LIST); setSelectedIndex(0); return; }
    if (input === '2') { setPage(PAGES.SKILLS); setActiveWindow(0); setSelectedIndex(0); return; }
    if (input === '3') { setPage(PAGES.TRASH); setActiveWindow(0); setSelectedIndex(0); return; }
    if (input === '4') { setPage(PAGES.CCR); setCcrActiveWindow(0); setCcrSelectedProvider(0); setCcrSelectedRouterRule(0); setCcrEditMode(false); return; }
    if (input === '5') { setPage(PAGES.SETTINGS); return; }

    if (page === PAGES.MCP && activeWindow === MCP_WINDOWS.LIST) {
      if (key.upArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => Math.min(currentList.length - 1, prev + 1)); return; }
    }
    if (page !== PAGES.MCP && page !== PAGES.CCR && activeWindow === 0) {
      if (key.upArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => Math.min(currentList.length - 1, prev + 1)); return; }
    }

    if (page === PAGES.CCR) {
      if (ccrEditMode) {
        const options = ccrManager?.getAllProviderModelOptions() || [];
        if (key.upArrow) { setCcrEditSelected(prev => Math.max(0, prev - 1)); return; }
        if (key.downArrow) { setCcrEditSelected(prev => Math.min(options.length - 1, prev + 1)); return; }
        if (key.return) {
          const selected = options[ccrEditSelected];
          if (selected) {
            const ruleKey = ROUTER_RULES[ccrSelectedRouterRule]?.key;
            if (ruleKey) {
              try {
                ccrManager.setRouterRule(ruleKey, selected.provider, selected.model);
                refreshCcrData();
                setMessage(`已设置 ${ROUTER_RULES[ccrSelectedRouterRule].label} → ${selected.label}`);
              } catch (err) {
                setError(err.message);
              }
            }
          }
          setCcrEditMode(false);
          return;
        }
        if (key.escape || input === 'q') {
          setCcrEditMode(false);
          return;
        }
        return;
      }

      if (ccrActiveWindow === 0) {
        if (key.upArrow) { setCcrSelectedProvider(prev => Math.max(0, prev - 1)); return; }
        if (key.downArrow) { setCcrSelectedProvider(prev => Math.min(ccrData.providers.length - 1, prev + 1)); return; }
      }

      if (ccrActiveWindow === 2) {
        if (key.upArrow) { setCcrSelectedRouterRule(prev => Math.max(0, prev - 1)); return; }
        if (key.downArrow) { setCcrSelectedRouterRule(prev => Math.min(ROUTER_RULES.length - 1, prev + 1)); return; }
        if (key.return) {
          const ruleKey = ROUTER_RULES[ccrSelectedRouterRule]?.key;
          const currentValue = ccrData.router[ruleKey];
          if (currentValue) {
            try {
              ccrManager.clearRouterRule(ruleKey);
              refreshCcrData();
              setMessage(`已清除 ${ROUTER_RULES[ccrSelectedRouterRule].label} 路由规则`);
            } catch (err) {
              setError(err.message);
            }
          } else {
            setCcrEditMode(true);
            setCcrEditSelected(0);
          }
          return;
        }
      }

      if (input === 's') {
        setCcrShowKeys(prev => !prev);
        return;
      }
    }

    if (page === PAGES.MCP && activeWindow === MCP_WINDOWS.DETAILS) {
      if (key.upArrow) { setDetailMenuIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setDetailMenuIndex(prev => Math.min(detailMenu.length - 1, prev + 1)); return; }
      if (key.return && selectedItem) {
        const action = detailMenu[detailMenuIndex]?.action;
        try {
          if (action === 'sync') {
            configManager.syncMcpServerToAll(selectedItem);
            refreshData();
            setMessage(`已同步 ${selectedItem} 到所有 CLI`);
          } else if (action === 'delete') {
            const serverInfo = mcpServers[selectedItem];
            const fromCLIs = Object.keys(serverInfo.clis);
            const config = serverInfo.clis[fromCLIs[0]].config;
            configManager.deleteMcpServer(selectedItem);
            managerConfig.moveToTrash(selectedItem, config, fromCLIs);
            refreshData();
            setSelectedIndex(prev => Math.max(0, prev - 1));
            setDetailMenuIndex(0);
            setMessage(`已将 ${selectedItem} 移入回收站`);
          } else if (action === 'toggle') {
            const serverInfo = mcpServers[selectedItem];
            for (const cli of Object.keys(serverInfo.clis)) {
              configManager.toggleMcpServer(selectedItem, cli);
            }
            refreshData();
            setMessage(`已切换 ${selectedItem} 状态`);
          }
        } catch (err) {
          setError(err.message);
        }
        return;
      }
    }

    if (page === PAGES.MCP && activeWindow === MCP_WINDOWS.PARAMS) {
      if (key.upArrow) { setCliSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setCliSelectedIndex(prev => Math.min(availableCLIs.length - 1, prev + 1)); return; }
      if (key.return && selectedItem) {
        const serverInfo = mcpServers[selectedItem];
        const selectedCli = availableCLIs[cliSelectedIndex];
        try {
          if (serverInfo.clis[selectedCli]) {
            const remaining = Object.keys(serverInfo.clis).filter(c => c !== selectedCli);
            if (remaining.length === 0) {
              setError('取消后将无CLI，请用 Delete 删除');
              return;
            }
            configManager.deleteMcpServer(selectedItem, selectedCli);
            setMessage(`已从 ${CLI_NAMES[selectedCli]} 移除 ${selectedItem}`);
          } else {
            const sourceCli = Object.keys(serverInfo.clis)[0];
            configManager.syncMcpServerTo(selectedItem, sourceCli, selectedCli);
            setMessage(`已添加 ${selectedItem} 到 ${CLI_NAMES[selectedCli]}`);
          }
          refreshData();
        } catch (err) {
          setError(err.message);
        }
        return;
      }
    }

    if (page === PAGES.MCP && input === 'd' && activeWindow === MCP_WINDOWS.LIST && selectedItem) {
      try {
        const serverInfo = mcpServers[selectedItem];
        const fromCLIs = Object.keys(serverInfo.clis);
        const config = serverInfo.clis[fromCLIs[0]].config;
        configManager.deleteMcpServer(selectedItem);
        managerConfig.moveToTrash(selectedItem, config, fromCLIs);
        refreshData();
        setSelectedIndex(prev => Math.max(0, prev - 1));
        setMessage(`已将 ${selectedItem} 移入回收站`);
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    if (page === PAGES.TRASH && selectedItem && key.return) {
      try {
        const trashItem = trash[selectedItem];
        for (const cli of trashItem.fromCLIs) {
          if (availableCLIs.includes(cli)) {
            if (!configManager.managers[cli]) configManager.managers[cli] = { config: { mcpServers: {} } };
            if (!configManager.managers[cli].config.mcpServers) configManager.managers[cli].config.mcpServers = {};
            configManager.managers[cli].config.mcpServers[selectedItem] = trashItem.config;
            configManager.saveConfig(cli);
          }
        }
        managerConfig.restoreFromTrash(selectedItem);
        refreshData();
        setSelectedIndex(prev => Math.max(0, prev - 1));
        setMessage(`已恢复 ${selectedItem}`);
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    if (page === PAGES.SKILLS && selectedItem && key.return) {
      try {
        configManager.toggleSkill(selectedItem);
        refreshData();
        const skill = skills[selectedItem];
        setMessage(`${skill?.name} 已${skill?.disabled ? '启用' : '禁用'}`);
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    if (input === 'r') { refreshData(); setMessage('已刷新'); return; }
  });

  const terminalWidth = stdout?.columns || 120;
  const terminalHeight = stdout?.rows || 30;
  const theme = PAGE_THEMES[page];

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <HeaderBar page={page} theme={theme} />
      <StatusLine error={error} message={message} />
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
        {page === PAGES.MCP && (
          <MCPPage
            mcpServers={mcpServers}
            selectedItem={selectedItem}
            selectedIndex={selectedIndex}
            cliSelectedIndex={cliSelectedIndex}
            detailMenuIndex={detailMenuIndex}
            detailMenu={detailMenu}
            activeWindow={activeWindow}
            availableCLIs={availableCLIs}
            terminalWidth={terminalWidth}
            terminalHeight={terminalHeight}
          />
        )}
        {page === PAGES.SKILLS && (
          <SkillsPage
            skills={skills}
            selectedItem={selectedItem}
            selectedIndex={selectedIndex}
            terminalWidth={terminalWidth}
            terminalHeight={terminalHeight}
          />
        )}
        {page === PAGES.TRASH && (
          <TrashPage
            trash={trash}
            selectedItem={selectedItem}
            selectedIndex={selectedIndex}
            terminalWidth={terminalWidth}
            terminalHeight={terminalHeight}
          />
        )}
        {page === PAGES.CCR && (
          <CCRPage
            ccrManager={ccrManager}
            ccrData={ccrData}
            ccrActiveWindow={ccrActiveWindow}
            ccrSelectedProvider={ccrSelectedProvider}
            ccrSelectedRouterRule={ccrSelectedRouterRule}
            ccrShowKeys={ccrShowKeys}
            ccrEditMode={ccrEditMode}
            ccrEditSelected={ccrEditSelected}
            terminalWidth={terminalWidth}
            terminalHeight={terminalHeight}
          />
        )}
        {page === PAGES.SETTINGS && (
          <SettingsPage availableCLIs={availableCLIs} />
        )}
      </Box>
      <FooterBar page={page} theme={theme} activeWindow={activeWindow} ccrActiveWindow={ccrActiveWindow} />
    </Box>
  );
}

// ─── Header Bar ────────────────────────────────────────────────────────────
function HeaderBar({ page, theme }) {
  const pages = [
    { key: PAGES.MCP,      num: '1', label: 'MCP' },
    { key: PAGES.SKILLS,   num: '2', label: 'Skills' },
    { key: PAGES.TRASH,    num: '3', label: 'Trash' },
    { key: PAGES.CCR,      num: '4', label: 'CCR' },
    { key: PAGES.SETTINGS, num: '5', label: 'Settings' }
  ];

  return (
    <Box
      borderStyle="single"
      borderColor={theme.accent}
      paddingX={1}
      height={3}
      flexDirection="row"
      alignItems="center"
    >
      <Text bold color={theme.bright}> {theme.icon} MCP Manager </Text>
      <Text color="gray">│</Text>
      {pages.map((p, i) => (
        <Box key={p.key} flexDirection="row">
          <Text> </Text>
          {page === p.key ? (
            <Text bold color={theme.bright} backgroundColor="gray">
              {' '}{p.num}:{p.label}{' '}
            </Text>
          ) : (
            <Text color="gray">{p.num}:{p.label}</Text>
          )}
          {i < pages.length - 1 && <Text color="gray"> │</Text>}
        </Box>
      ))}
      <Box flexGrow={1} />
      <Text color="gray" dimColor>v1.1.0 </Text>
    </Box>
  );
}

// ─── Status Line ───────────────────────────────────────────────────────────
function StatusLine({ error, message }) {
  return (
    <Box height={1} paddingX={1}>
      {error && (
        <Text color="red" bold>
          {' '}{ICONS.cross} {error}
        </Text>
      )}
      {!error && message && (
        <Text color="green" bold>
          {' '}{ICONS.check} {message}
        </Text>
      )}
    </Box>
  );
}

// ─── Footer Bar ────────────────────────────────────────────────────────────
function FooterBar({ page, theme, activeWindow, ccrActiveWindow }) {
  let hint = '';
  if (page === PAGES.MCP) {
    const focus = activeWindow === MCP_WINDOWS.LIST ? 'List' : activeWindow === MCP_WINDOWS.DETAILS ? 'Details' : 'CLI';
    hint = `${focus} | Tab/←→ switch focus | ↑↓ nav | Enter action | d delete | r refresh | q quit`;
  } else if (page === PAGES.SKILLS) {
    hint = '↑↓ nav | Enter toggle | r refresh | q quit';
  } else if (page === PAGES.TRASH) {
    hint = '↑↓ nav | Enter restore | r refresh | q quit';
  } else if (page === PAGES.CCR) {
    const focus = ccrActiveWindow === 0 ? 'Providers' : ccrActiveWindow === 1 ? 'Details' : 'Router';
    hint = `${focus} | Tab/←→ switch focus | ↑↓ nav | Enter edit/clear | s show keys | r refresh | q quit`;
  } else {
    hint = 'r refresh | q quit';
  }

  return (
    <Box
      borderStyle="single"
      borderColor={theme.accent}
      paddingX={1}
      height={1}
      flexDirection="row"
      alignItems="center"
    >
      <Text bold color={theme.bright}> {theme.icon} </Text>
      <Text color="gray" dimColor>{hint}</Text>
      <Box flexGrow={1} />
      <Text color="gray" dimColor>Manager </Text>
    </Box>
  );
}

// ─── MCP Page ──────────────────────────────────────────────────────────────
function MCPPage({ mcpServers, selectedItem, selectedIndex, cliSelectedIndex, detailMenuIndex, detailMenu, activeWindow, availableCLIs, terminalWidth, terminalHeight }) {
  const mcpList = Object.keys(mcpServers).sort();
  const serverInfo = selectedItem ? mcpServers[selectedItem] : null;

  const leftWidth = Math.floor(terminalWidth * 0.24);
  const middleWidth = Math.floor(terminalWidth * 0.48);
  const rightWidth = terminalWidth - leftWidth - middleWidth;

  const listVisible = Math.max(3, terminalHeight - 9);
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(listVisible / 2),
    Math.max(0, mcpList.length - listVisible)
  ));
  const visibleList = mcpList.slice(scrollOffset, scrollOffset + listVisible);

  const accent = 'green';
  const bright = 'brightGreen';

  return (
    <>
      {/* Left: MCP list */}
      <Box
        width={leftWidth}
        borderStyle="single"
        borderColor={activeWindow === MCP_WINDOWS.LIST ? bright : 'gray'}
        flexDirection="column"
        paddingX={1}
      >
        <Box flexDirection="row" alignItems="center">
          <Text bold color={bright}>MCP </Text>
          <Text color="gray" dimColor>({mcpList.length})</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && (
            <Text color="gray" dimColor>  ··· {scrollOffset} above</Text>
          )}
          {visibleList.map((name, i) => {
            const realIdx = scrollOffset + i;
            const active = realIdx === selectedIndex;
            const disabled = mcpServers[name]?.clis[Object.keys(mcpServers[name].clis)[0]]?.config?.disabled;
            return (
              <Text
                key={name}
                bold={active}
                color={active ? bright : disabled ? 'gray' : 'white'}
                wrap="truncate"
              >
                {active ? ICONS.selected + ' ' : '  '}
                {disabled ? ICONS.neutral : ICONS.dot}
                {' '}{name}
              </Text>
            );
          })}
          {scrollOffset + listVisible < mcpList.length && (
            <Text color="gray" dimColor>  ··· {mcpList.length - scrollOffset - listVisible} below</Text>
          )}
        </Box>
      </Box>

      {/* Middle: Details */}
      <Box
        width={middleWidth}
        borderStyle="single"
        borderColor={activeWindow === MCP_WINDOWS.DETAILS ? bright : 'gray'}
        flexDirection="column"
        paddingX={1}
      >
        <Text bold color={bright}>Details</Text>
        <Box flexDirection="column" marginTop={1}>
          {serverInfo ? (
            <MCPDetails
              serverInfo={serverInfo}
              selectedItem={selectedItem}
              detailMenu={detailMenu}
              detailMenuIndex={detailMenuIndex}
              activeWindow={activeWindow}
            />
          ) : (
            <Text color="gray" dimColor>Select an MCP server</Text>
          )}
        </Box>
      </Box>

      {/* Right: CLI Assignment */}
      <Box
        width={rightWidth}
        borderStyle="single"
        borderColor={activeWindow === MCP_WINDOWS.PARAMS ? bright : 'gray'}
        flexDirection="column"
        paddingX={1}
      >
        <Text bold color={bright}>CLI</Text>
        {serverInfo ? (
          <Box flexDirection="column" marginTop={1}>
            {availableCLIs.map((cli, index) => {
              const hasCli = !!serverInfo.clis[cli];
              const isSelected = activeWindow === MCP_WINDOWS.PARAMS && index === cliSelectedIndex;
              return (
                <Box key={cli} flexDirection="column">
                  <Text bold={isSelected} color={isSelected ? bright : 'white'}>
                    {isSelected ? ICONS.selected + ' ' : '  '}
                    {hasCli ? ICONS.enabled : ICONS.neutral}
                    {' '}{CLI_NAMES[cli]}
                  </Text>
                  {isSelected && (
                    <Text color="yellow" dimColor>   [Enter] {hasCli ? 'remove' : 'add'}</Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ) : (
          <Text color="gray" dimColor marginTop={1}>Select MCP</Text>
        )}
      </Box>
    </>
  );
}

function MCPDetails({ serverInfo, selectedItem, detailMenu, detailMenuIndex, activeWindow }) {
  const firstCli = Object.keys(serverInfo.clis)[0];
  const config = serverInfo.clis[firstCli]?.config || {};
  const isDisabled = !!config.disabled;
  const configPaths = Object.keys(serverInfo.clis)
    .map(cli =>
      cli === SUPPORTED_CLIS.CLAUDE ? '~/.claude.json' :
      cli === SUPPORTED_CLIS.GEMINI ? '~/.gemini/settings.json' : cli
    )
    .join(', ');

  const configEntries = Object.entries(config).filter(([k]) => k !== 'disabled');

  return (
    <Box flexDirection="column">
      <Text bold color="white" underline>{selectedItem}</Text>
      <Box marginY={1} flexDirection="row">
        <Text color="gray">Status: </Text>
        {isDisabled ? (
          <Text bold color="red">{ICONS.disabled} Disabled</Text>
        ) : (
          <Text bold color="green">{ICONS.enabled} Active</Text>
        )}
      </Box>
      <Box flexDirection="row">
        <Text color="gray">Config: </Text>
        <Text color="white">{configPaths}</Text>
      </Box>
      <Box marginY={1} borderStyle="single" borderColor="gray" paddingX={1}>
        {configEntries.map(([key, value]) => {
          if (Array.isArray(value)) {
            return (
              <Box key={key} flexDirection="column">
                <Text color="gray">{key}:</Text>
                {value.map((item, i) => (
                  <Text key={i} color="white" wrap="truncate">{'  › '}{String(item)}</Text>
                ))}
              </Box>
            );
          }
          if (typeof value === 'object' && value !== null) {
            return (
              <Box key={key} flexDirection="column">
                <Text color="gray">{key}:</Text>
                {Object.entries(value).map(([k, v]) => (
                  <Text key={k} color="white" wrap="truncate">{'  › '}{k}: <Text color="gray">{maskValue(k, v)}</Text></Text>
                ))}
              </Box>
            );
          }
          return (
            <Text key={key} wrap="truncate">
              <Text color="gray">{key}: </Text>
              <Text color="white">{String(value)}</Text>
            </Text>
          );
        })}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {detailMenu.map((item, i) => {
          const active = activeWindow === MCP_WINDOWS.DETAILS && i === detailMenuIndex;
          return (
            <Text key={item.action} bold={active} color={active ? 'yellow' : 'gray'}>
              {active ? ICONS.arrow + ' ' : '  '}{item.label}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Skills Page ───────────────────────────────────────────────────────────
function SkillsPage({ skills, selectedItem, selectedIndex, terminalWidth, terminalHeight }) {
  const skillsList = Object.keys(skills).sort();
  const skill = selectedItem ? skills[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.35);
  const listVisible = Math.max(3, terminalHeight - 9);
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(listVisible / 2),
    Math.max(0, skillsList.length - listVisible)
  ));
  const visibleList = skillsList.slice(scrollOffset, scrollOffset + listVisible);

  const accent = 'blue';
  const bright = 'brightBlue';

  return (
    <>
      <Box width={leftWidth} borderStyle="single" borderColor={bright} flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center">
          <Text bold color={bright}>Skills </Text>
          <Text color="gray" dimColor>({skillsList.length})</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && <Text color="gray" dimColor>  ··· {scrollOffset} above</Text>}
          {visibleList.map((key, i) => {
            const realIdx = scrollOffset + i;
            const s = skills[key];
            const active = realIdx === selectedIndex;
            return (
              <Text key={key} bold={active} color={active ? bright : s.disabled ? 'gray' : 'white'} wrap="truncate">
                {active ? ICONS.selected + ' ' : '  '}
                {s.disabled ? ICONS.neutral : ICONS.enabled}
                {' '}{s.name}
              </Text>
            );
          })}
          {scrollOffset + listVisible < skillsList.length && (
            <Text color="gray" dimColor>  ··· {skillsList.length - scrollOffset - listVisible} below</Text>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Text bold color={bright}>Details</Text>
        {skill ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="white" underline>{skill.name}</Text>
            <Box marginY={1} flexDirection="row">
              <Text color="gray">Status: </Text>
              {skill.disabled ? (
                <Text bold color="red">{ICONS.disabled} Disabled</Text>
              ) : (
                <Text bold color="green">{ICONS.enabled} Enabled</Text>
              )}
            </Box>
            <Box flexDirection="row">
              <Text color="gray">Version: </Text>
              <Text color="white">{skill.version}</Text>
            </Box>
            <Box flexDirection="row">
              <Text color="gray">Marketplace: </Text>
              <Text color="white">{skill.marketplace}</Text>
            </Box>
            {skill.installedAt && (
              <Box flexDirection="row">
                <Text color="gray">Installed: </Text>
                <Text color="gray">{new Date(skill.installedAt).toLocaleDateString()}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text bold color="yellow">{ICONS.arrow} {skill.disabled ? 'Enable' : 'Disable'}</Text>
            </Box>
          </Box>
        ) : (
          <Text color="gray" dimColor marginTop={1}>Select a skill</Text>
        )}
      </Box>
    </>
  );
}

// ─── Trash Page ────────────────────────────────────────────────────────────
function TrashPage({ trash, selectedItem, selectedIndex, terminalWidth, terminalHeight }) {
  const trashList = Object.keys(trash).sort();
  const item = selectedItem ? trash[selectedItem] : null;
  const leftWidth = Math.floor(terminalWidth * 0.35);
  const listVisible = Math.max(3, terminalHeight - 9);
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(listVisible / 2),
    Math.max(0, trashList.length - listVisible)
  ));
  const visibleList = trashList.slice(scrollOffset, scrollOffset + listVisible);

  const accent = 'red';
  const bright = 'brightRed';

  return (
    <>
      <Box width={leftWidth} borderStyle="single" borderColor={bright} flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center">
          <Text bold color={bright}>Trash </Text>
          <Text color="gray" dimColor>({trashList.length})</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && <Text color="gray" dimColor>  ··· {scrollOffset} above</Text>}
          {visibleList.map((name, i) => {
            const realIdx = scrollOffset + i;
            const active = realIdx === selectedIndex;
            return (
              <Text key={name} bold={active} color={active ? bright : 'gray'} wrap="truncate">
                {active ? ICONS.selected + ' ' : '  '}
                {ICONS.neutral} {name}
              </Text>
            );
          })}
          {scrollOffset + listVisible < trashList.length && (
            <Text color="gray" dimColor>  ··· {trashList.length - scrollOffset - listVisible} below</Text>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <Text bold color={bright}>Details</Text>
        {item ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="white" underline>{selectedItem}</Text>
            <Box marginY={1} flexDirection="row">
              <Text color="gray">Deleted: </Text>
              <Text color="gray">{new Date(item.deletedAt).toLocaleString()}</Text>
            </Box>
            <Box flexDirection="row">
              <Text color="gray">From: </Text>
              <Text color="white">{item.fromCLIs.map(c => CLI_NAMES[c] || c).join(', ')}</Text>
            </Box>
            <Box marginTop={1}>
              <Text bold color="yellow">{ICONS.arrow} Restore</Text>
            </Box>
          </Box>
        ) : (
          <Text color="gray" dimColor marginTop={1}>Select an item</Text>
        )}
      </Box>
    </>
  );
}

// ─── CCR Page ──────────────────────────────────────────────────────────────
function CCRPage({ ccrManager, ccrData, ccrActiveWindow, ccrSelectedProvider, ccrSelectedRouterRule, ccrShowKeys, ccrEditMode, ccrEditSelected, terminalWidth, terminalHeight }) {
  const providers = ccrData.providers || [];
  const router = ccrData.router || {};
  const selectedProvider = providers[ccrSelectedProvider];

  const leftWidth = Math.floor(terminalWidth * 0.25);
  const middleWidth = Math.floor(terminalWidth * 0.45);
  const rightWidth = terminalWidth - leftWidth - middleWidth;

  const listVisible = Math.max(3, terminalHeight - 9);
  const scrollOffset = Math.max(0, Math.min(
    ccrSelectedProvider - Math.floor(listVisible / 2),
    Math.max(0, providers.length - listVisible)
  ));
  const visibleProviders = providers.slice(scrollOffset, scrollOffset + listVisible);

  const editOptions = ccrManager?.getAllProviderModelOptions() || [];
  const editVisible = Math.max(3, terminalHeight - 9);
  const editScrollOffset = Math.max(0, Math.min(
    ccrEditSelected - Math.floor(editVisible / 2),
    Math.max(0, editOptions.length - editVisible)
  ));
  const visibleEditOptions = editOptions.slice(editScrollOffset, editScrollOffset + editVisible);

  const accent = 'magenta';
  const bright = 'brightMagenta';

  if (ccrEditMode) {
    return (
      <Box flexGrow={1} borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center">
          <Text bold color="yellow">{ICONS.arrow} </Text>
          <Text bold color="yellow">Select Provider/Model for {ROUTER_RULES[ccrSelectedRouterRule]?.label}</Text>
        </Box>
        <Text color="gray" dimColor>↑↓ navigate | Enter confirm | Esc cancel</Text>
        <Box flexDirection="column" marginTop={1}>
          {editScrollOffset > 0 && (
            <Text color="gray" dimColor>  ··· {editScrollOffset} above</Text>
          )}
          {visibleEditOptions.map((opt, i) => {
            const realIdx = editScrollOffset + i;
            const active = realIdx === ccrEditSelected;
            return (
              <Text key={opt.label} bold={active} color={active ? 'yellow' : 'white'} wrap="truncate">
                {active ? ICONS.selected + ' ' : '  '}{opt.label}
              </Text>
            );
          })}
          {editScrollOffset + editVisible < editOptions.length && (
            <Text color="gray" dimColor>  ··· {editOptions.length - editScrollOffset - editVisible} below</Text>
          )}
        </Box>
      </Box>
    );
  }

  if (!ccrManager || !ccrManager.isAvailable()) {
    return (
      <Box flexGrow={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={bright}>{ICONS.dot} CCR Router</Text>
        <Text> </Text>
        <Text color="gray">CCR config not found at ~/.claude-code-router/config.json</Text>
        <Text color="gray">Install and configure CCR first:</Text>
        <Text color="yellow">  npm install -g @musistudio/claude-code-router</Text>
        <Text color="yellow">  ccr ui</Text>
      </Box>
    );
  }

  return (
    <>
      {/* Left: Provider list */}
      <Box
        width={leftWidth}
        borderStyle="single"
        borderColor={ccrActiveWindow === 0 ? bright : 'gray'}
        flexDirection="column"
        paddingX={1}
      >
        <Box flexDirection="row" alignItems="center">
          <Text bold color={bright}>Providers </Text>
          <Text color="gray" dimColor>({providers.length})</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {scrollOffset > 0 && (
            <Text color="gray" dimColor>  ··· {scrollOffset} above</Text>
          )}
          {visibleProviders.map((p, i) => {
            const realIdx = scrollOffset + i;
            const active = realIdx === ccrSelectedProvider;
            return (
              <Text key={p.name} bold={active} color={active ? bright : 'white'} wrap="truncate">
                {active ? ICONS.selected + ' ' : '  '}
                {ICONS.dot} {p.name}
              </Text>
            );
          })}
          {scrollOffset + listVisible < providers.length && (
            <Text color="gray" dimColor>  ··· {providers.length - scrollOffset - listVisible} below</Text>
          )}
        </Box>
      </Box>

      {/* Middle: Provider details */}
      <Box
        width={middleWidth}
        borderStyle="single"
        borderColor={ccrActiveWindow === 1 ? bright : 'gray'}
        flexDirection="column"
        paddingX={1}
      >
        <Text bold color={bright}>Provider Details</Text>
        <Box flexDirection="column" marginTop={1}>
          {selectedProvider ? (
            <>
              <Text bold color="white" underline>{selectedProvider.name}</Text>
              <Box marginY={1} flexDirection="column">
                <Box flexDirection="row">
                  <Text color="gray">API Base: </Text>
                  <Text color="white">{selectedProvider.api_base_url}</Text>
                </Box>
                <Box flexDirection="row">
                  <Text color="gray">API Key: </Text>
                  <Text color="white">{ccrShowKeys ? selectedProvider.api_key : maskApiKey(selectedProvider.api_key)}</Text>
                  <Text color="yellow" dimColor> [s]</Text>
                </Box>
              </Box>
              <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
                <Text color="gray">Models ({selectedProvider.models?.length || 0}):</Text>
                {(selectedProvider.models || []).map((m, i) => (
                  <Text key={i} color="white" wrap="truncate">{'  › '}{m}</Text>
                ))}
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>Select a provider</Text>
          )}
        </Box>
      </Box>

      {/* Right: Router rules */}
      <Box
        width={rightWidth}
        borderStyle="single"
        borderColor={ccrActiveWindow === 2 ? bright : 'gray'}
        flexDirection="column"
        paddingX={1}
      >
        <Text bold color={bright}>Router Rules</Text>
        <Box flexDirection="column" marginTop={1}>
          {ROUTER_RULES.map((rule, i) => {
            const active = i === ccrSelectedRouterRule && ccrActiveWindow === 2;
            const value = router[rule.key] || '';
            const { provider, model } = ccrManager.parseRouterValue(value);
            return (
              <Box key={rule.key} flexDirection="column" marginBottom={1}>
                <Text bold={active} color={active ? bright : 'white'} wrap="truncate">
                  {active ? ICONS.selected + ' ' : '  '}
                  {rule.label}
                </Text>
                <Text color="gray" dimColor wrap="truncate">{'    '}{rule.desc}</Text>
                {value ? (
                  <Box flexDirection="row">
                    <Text color="gray">{'    '}{ICONS.arrow} </Text>
                    <Text color="green" bold>{provider}</Text>
                    {model && <Text color="white">,{model}</Text>}
                  </Box>
                ) : (
                  <Text color="gray" dimColor>{'    '}(not set)</Text>
                )}
                {active && (
                  <Text color="yellow" dimColor>{'    '}[Enter] {value ? 'clear' : 'set'}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </>
  );
}

// ─── Settings Page ─────────────────────────────────────────────────────────
function SettingsPage({ availableCLIs }) {
  const accent = 'cyan';
  const bright = 'brightCyan';

  return (
    <Box flexGrow={1} borderStyle="single" borderColor={bright} flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color={bright}>{ICONS.dot} Settings</Text>
      <Text> </Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Detected CLIs</Text>
        {availableCLIs.map((cli, index) => (
          <Box key={cli} flexDirection="row">
            <Text color="gray">{'  › '}</Text>
            <Text color={bright}>{CLI_NAMES[cli]}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Config Paths</Text>
        {availableCLIs.includes(SUPPORTED_CLIS.CLAUDE) && (
          <Box flexDirection="row">
            <Text color="gray">{'  › '}</Text>
            <Text color="white">~/.claude.json</Text>
          </Box>
        )}
        {availableCLIs.includes(SUPPORTED_CLIS.GEMINI) && (
          <Box flexDirection="row">
            <Text color="gray">{'  › '}</Text>
            <Text color="white">~/.gemini/settings.json</Text>
          </Box>
        )}
        <Box flexDirection="row">
          <Text color="gray">{'  › '}</Text>
          <Text color="white">~/.claude-code-router/config.json</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Manager</Text>
        <Box flexDirection="row">
          <Text color="gray">{'  › '}</Text>
          <Text color="white">~/.gwyy_ms_Manager.json</Text>
        </Box>
        <Box flexDirection="row">
          <Text color="gray">{'  › '}</Text>
          <Text color="white">~/.claude-backups/</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text bold color="yellow">Version</Text>
        <Box flexDirection="row">
          <Text color="gray">{'  › '}</Text>
          <Text color="white">v1.1.0</Text>
        </Box>
      </Box>
    </Box>
  );
}
