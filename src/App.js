import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConfigManager, SUPPORTED_CLIS } from './ConfigManager.js';
import { ManagerConfig } from './ManagerConfig.js';
import { CcrConfigManager, ROUTER_RULES } from './CcrConfigManager.js';
import { THEME, PAGE_META, MCP_WINDOWS } from './theme.js';
import { CLI_NAMES } from './constants/cliNames.js';

import MCPPage from './pages/MCPPage.js';
import SkillsPage from './pages/SkillsPage.js';
import TrashPage from './pages/TrashPage.js';
import CCRPage from './pages/CCRPage.js';
import SettingsPage from './pages/SettingsPage.js';

// ── 页面标识常量 ─────────────────────────────────────────
const PAGES = {
  MCP: 'mcp',
  SKILLS: 'skills',
  TRASH: 'trash',
  CCR: 'ccr',
  SETTINGS: 'settings'
};

/**
 * App — 应用根组件
 *
 * 架构角色：全局状态管理中心 + 键盘事件路由
 *
 * 【状态分层】
 * - 导航层：page, activeWindow
 * - 选择层：selectedIndex, cliSelectedIndex, detailMenuIndex
 * - 数据层：mcpServers, skills, trash, ccrData
 * - 服务层：configManager, managerConfig, ccrManager（三个 Manager 实例）
 * - UI反馈：error, message
 *
 * 【键盘输入流】
 * useInput → 判断 page → 判断 activeWindow → 分发到具体处理逻辑 → 调用 Manager → setState → 重渲染
 *
 * 【页面切换】
 * 数字键 1-5 直接切页，5 个 Page 组件按 page 条件渲染
 * MCP 页面还有子窗口切换（Tab/←→ 在 LIST/DETAILS/PARAMS 间轮转）
 */
export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // ── 导航状态 ──────────────────────────────────────────
  const [page, setPage] = useState(PAGES.MCP);
  const [activeWindow, setActiveWindow] = useState(MCP_WINDOWS.LIST);   // MCP 子窗口
  const [selectedIndex, setSelectedIndex] = useState(0);                // 主列表选中项
  const [cliSelectedIndex, setCliSelectedIndex] = useState(0);          // CLI 参数面板选中项
  const [detailMenuIndex, setDetailMenuIndex] = useState(0);            // 操作菜单选中项

  // ── 服务实例（useEffect 初始化，整个生命周期只创建一次） ──
  const [configManager, setConfigManager] = useState(null);
  const [managerConfig, setManagerConfig] = useState(null);
  const [ccrManager, setCcrManager] = useState(null);
  const [availableCLIs, setAvailableCLIs] = useState([]);
  const [mcpServers, setMcpServers] = useState({});
  const [skills, setSkills] = useState({});
  const [trash, setTrash] = useState({});
  const [ccrData, setCcrData] = useState({ providers: [], router: {} });

  // ── CCR 专属状态 ──────────────────────────────────────
  const [ccrActiveWindow, setCcrActiveWindow] = useState(0);            // 0=Providers, 1=Detail, 2=Router
  const [ccrSelectedProvider, setCcrSelectedProvider] = useState(0);
  const [ccrSelectedRouterRule, setCcrSelectedRouterRule] = useState(0);
  const [ccrShowKeys, setCcrShowKeys] = useState(false);               // 是否明文显示 API Key
  const [ccrEditMode, setCcrEditMode] = useState(false);               // 是否在编辑路由规则
  const [ccrEditSelected, setCcrEditSelected] = useState(0);

  // ── 反馈状态 ──────────────────────────────────────────
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // 初始化：一次创建三个 Manager 实例，加载所有数据
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

  // 刷新所有数据（"r" 键触发）
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

  // 根据当前页面返回对应的列表数据
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

  // 生成详情面板的操作菜单项（根据选中 MCP 的状态动态显示）
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

  // ── 全局键盘事件处理 ───────────────────────────────────
  // 这是一个集中式路由：根据 page + activeWindow 分发到各自逻辑
  useInput((input, key) => {
    // 按任意键清除上次的反馈消息
    if (message) setMessage(null);
    if (error) setError(null);

    // 全局退出
    if (input === 'q') { exit(); return; }

    // ── 窗口/页面切换（Tab / ←→） ──
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

    // ── 数字键切页（1-5） ──
    if (input === '1') { setPage(PAGES.MCP); setActiveWindow(MCP_WINDOWS.LIST); setSelectedIndex(0); return; }
    if (input === '2') { setPage(PAGES.SKILLS); setActiveWindow(0); setSelectedIndex(0); return; }
    if (input === '3') { setPage(PAGES.TRASH); setActiveWindow(0); setSelectedIndex(0); return; }
    if (input === '4') { setPage(PAGES.CCR); setCcrActiveWindow(0); setCcrSelectedProvider(0); setCcrSelectedRouterRule(0); setCcrEditMode(false); return; }
    if (input === '5') { setPage(PAGES.SETTINGS); setActiveWindow(0); setSelectedIndex(0); return; }

    // ── 列表导航（↑↓） ──
    if (page === PAGES.MCP && activeWindow === MCP_WINDOWS.LIST) {
      if (key.upArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => Math.min(currentList.length - 1, prev + 1)); return; }
    }
    if (page !== PAGES.MCP && page !== PAGES.CCR && activeWindow === 0) {
      if (key.upArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => Math.min(currentList.length - 1, prev + 1)); return; }
    }

    // ── CCR 页面逻辑 ────────────────────────────────────
    if (page === PAGES.CCR) {
      // 编辑模式：选 Provider/Model 弹窗
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

      // Provider 列导航
      if (ccrActiveWindow === 0) {
        if (key.upArrow) { setCcrSelectedProvider(prev => Math.max(0, prev - 1)); return; }
        if (key.downArrow) { setCcrSelectedProvider(prev => Math.min(ccrData.providers.length - 1, prev + 1)); return; }
      }

      // Router 列导航 + 编辑/清除
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

    // ── MCP 详情面板操作菜单 ────────────────────────────
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

    // ── MCP 参数面板（关联 CLI 列表） ────────────────────
    if (page === PAGES.MCP && activeWindow === MCP_WINDOWS.PARAMS) {
      if (key.upArrow) { setCliSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setCliSelectedIndex(prev => Math.min(availableCLIs.length - 1, prev + 1)); return; }
      if (key.return && selectedItem) {
        const serverInfo = mcpServers[selectedItem];
        const selectedCli = availableCLIs[cliSelectedIndex];
        try {
          if (serverInfo.clis[selectedCli]) {
            // 该 CLI 已有此 MCP → 移除
            const remaining = Object.keys(serverInfo.clis).filter(c => c !== selectedCli);
            if (remaining.length === 0) {
              setError('取消后将无CLI，请用 Delete 删除');
              return;
            }
            configManager.deleteMcpServer(selectedItem, selectedCli);
            setMessage(`已从 ${CLI_NAMES[selectedCli]} 移除 ${selectedItem}`);
          } else {
            // 该 CLI 无此 MCP → 添加
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

    // ── MCP 快速删除（d 键） ─────────────────────────────
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

    // ── 回收站恢复 ──────────────────────────────────────
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

    // ── Skills 切换 ─────────────────────────────────────
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

    // 全局刷新
    if (input === 'r') { refreshData(); setMessage('已刷新'); return; }
  });

  // ── 渲染 ──────────────────────────────────────────────
  const terminalWidth = stdout?.columns || 120;
  const terminalHeight = stdout?.rows || 30;
  const meta = PAGE_META[page];

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      {/* ── Top Bar: 标题 + Tab 标签 + 消息 ──────────────── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        <Text bold color={meta.color}>{meta.label}</Text>
        <Text color="gray">{'  '}</Text>
        {Object.values(PAGE_META).map((p, i) => (
          <Box key={p.label} flexDirection="row">
            <Text color={p.num === meta.num ? meta.color : 'gray'}>
              {p.num === meta.num ? `[${p.num}]` : ` ${p.num} `}
            </Text>
            {i < 4 && <Text color="gray">{'│'}</Text>}
          </Box>
        ))}
        <Box flexGrow={1} />
        {error && <Text color={THEME.dangerBright}>✗ {error}</Text>}
        {!error && message && <Text color={THEME.successBright}>✓ {message}</Text>}
      </Box>

      <Box height={1} paddingX={1}>
        <Text color="gray">{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>

      {/* ── Content: 按 page 条件渲染对应页面组件 ────────── */}
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

      <Box height={1} paddingX={1}>
        <Text color="gray">{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>

      {/* ── Bottom Bar: 快捷键提示 ──────────────────────── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        <Text color="gray" dimColor>
          {page === PAGES.MCP && `Tab/←→ focus  │  ↑↓ nav  │  ↵ action  │  d delete  │  r refresh  │  q quit`}
          {page === PAGES.SKILLS && `↑↓ nav  │  ↵ toggle  │  r refresh  │  q quit`}
          {page === PAGES.TRASH && `↑↓ nav  │  ↵ restore  │  r refresh  │  q quit`}
          {page === PAGES.CCR && `Tab/←→ focus  │  ↑↓ nav  │  ↵ edit  │  s keys  │  r refresh  │  q quit`}
          {page === PAGES.SETTINGS && `r refresh  │  q quit`}
        </Text>
      </Box>
    </Box>
  );
}
