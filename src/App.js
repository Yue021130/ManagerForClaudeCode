import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ConfigManager } from './ConfigManager.js';
import { CcrConfigManager, ROUTER_RULES } from './CcrConfigManager.js';
import { THEME, PAGES, PAGE_META, MCP_WINDOWS } from './theme.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';

import CCRPage from './pages/CCRPage.js';
import MCPPage from './pages/MCPPage.js';
import SKILLPage from './pages/SKILLPage.js';
import SETTINGPage from './pages/SETTINGPage.js';

// 各页面底部键帽提示：[按键, 说明]
const FOOTER_HINTS = {
  [PAGES.CCR]: [
    ['Tab/←→', 'focus'], ['↑↓', 'nav'], ['↵', 'set/clear'], ['s', 'keys'], ['r', 'refresh'], ['q', 'quit']
  ],
  [PAGES.MCP]: [
    ['Tab/←→', 'focus'], ['↑↓', 'nav'], ['↵', 'action'], ['d', 'remove'], ['y/n', 'confirm'], ['r', 'refresh'], ['q', 'quit']
  ],
  [PAGES.SKILL]: [
    ['↑↓', 'nav'], ['↵', 'remove/restore'], ['r', 'refresh'], ['q', 'quit']
  ],
  [PAGES.SETTING]: [
    ['r', 'refresh'], ['q', 'quit']
  ]
};

/**
 * App — 应用根组件
 *
 * 架构角色：全局状态管理中心 + 键盘事件路由
 *
 * 【状态分层】
 * - 导航层：page, activeWindow
 * - 选择层：selectedIndex, detailMenuIndex
 * - 数据层：mcpServers, skills, ccrData
 * - 服务层：configManager, ccrManager（两个 Manager 实例）
 * - UI反馈：error, message, pendingRemove（暂时移除确认）
 *
 * 【键盘输入流】
 * useInput → 判断 page → 判断 activeWindow → 分发到具体处理逻辑 → 调用 Manager → setState → 重渲染
 *
 * 【页面切换】
 * 数字键 0-3 直接切页（CCR 是核心，占据 0 号位且为启动默认页）
 * MCP 页面有子窗口切换（Tab/←→ 在 LIST/DETAILS 间轮转）
 */
export default function App() {
  const { exit } = useApp();

  // ── 导航状态 ──────────────────────────────────────────
  const [page, setPage] = useState(PAGES.CCR);                          // 默认直达核心页
  const [activeWindow, setActiveWindow] = useState(MCP_WINDOWS.LIST);   // MCP 子窗口
  const [selectedIndex, setSelectedIndex] = useState(0);                // 主列表选中项
  const [detailMenuIndex, setDetailMenuIndex] = useState(0);            // 操作菜单选中项

  // ── 服务实例（useEffect 初始化，整个生命周期只创建一次） ──
  const [configManager, setConfigManager] = useState(null);
  const [ccrManager, setCcrManager] = useState(null);
  const [mcpServers, setMcpServers] = useState({});
  const [skills, setSkills] = useState({});
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
  const [pendingRemove, setPendingRemove] = useState(null);             // 待确认暂时移除的 MCP 名称

  // 初始化：创建两个 Manager 实例，加载所有数据
  useEffect(() => {
    try {
      const manager = new ConfigManager();
      const ccr = new CcrConfigManager();
      setConfigManager(manager);
      setCcrManager(ccr);
      setMcpServers(manager.getMcpServers());
      setSkills(manager.getSkills());
      refreshCcrData(ccr);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // 刷新所有数据（"r" 键触发）
  const refreshData = () => {
    if (configManager) {
      configManager.reload();
      setMcpServers(configManager.getMcpServers());
      setSkills(configManager.getSkills());
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
      case PAGES.SKILL: return Object.keys(skills).sort();
      case PAGES.CCR: return ccrData.providers.map(p => p.name);
      default: return [];
    }
  };

  const currentList = getCurrentList();
  const selectedItem = currentList[selectedIndex];

  // 生成详情面板的操作菜单项（根据选中 MCP 的状态动态显示：暂时移除 或 恢复）
  const getDetailMenu = (name) => {
    if (!name || !mcpServers[name]) return [];
    const server = mcpServers[name];
    if (server.removed) {
      return [{ label: 'Restore 恢复', action: 'restore' }];
    }
    return [{ label: 'Remove 暂时移除', action: 'remove' }];
  };

  const detailMenu = getDetailMenu(selectedItem);

  // ── 全局键盘事件处理 ───────────────────────────────────
  // 这是一个集中式路由：根据 page + activeWindow 分发到各自逻辑
  useInput((input, key) => {
    // 按任意键清除上次的反馈消息
    if (message) setMessage(null);
    if (error) setError(null);

    // ── 暂时移除确认（模态）：y 确认 / n 或 Esc 取消，其余按键全部拦截 ──
    if (pendingRemove !== null) {
      if (input === 'y') {
        try {
          configManager.removeMcpServer(pendingRemove);
          refreshData();
          setMessage(`已暂时移除 ${pendingRemove}（选中后按 Restore 可恢复）`);
        } catch (err) {
          setError(err.message);
        }
        setPendingRemove(null);
      } else if (input === 'n' || key.escape) {
        setPendingRemove(null);
      }
      return;
    }

    // 全局退出
    if (input === 'q') { exit(); return; }

    // ── 窗口/页面切换（Tab / ←→） ──
    if (key.tab || key.leftArrow || key.rightArrow) {
      if (page === PAGES.MCP) {
        if (key.leftArrow) {
          setActiveWindow(prev => prev === 0 ? MCP_WINDOWS.DETAILS : prev - 1);
        } else {
          setActiveWindow(prev => (prev + 1) % 2);
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

    // ── 数字键切页（0-3） ──
    if (input === '0') { setPage(PAGES.CCR); setCcrActiveWindow(0); setCcrSelectedProvider(0); setCcrSelectedRouterRule(0); setCcrEditMode(false); return; }
    if (input === '1') { setPage(PAGES.MCP); setActiveWindow(MCP_WINDOWS.LIST); setSelectedIndex(0); setDetailMenuIndex(0); return; }
    if (input === '2') { setPage(PAGES.SKILL); setSelectedIndex(0); return; }
    if (input === '3') { setPage(PAGES.SETTING); return; }

    // ── 列表导航（↑↓） ──
    if (page === PAGES.MCP && activeWindow === MCP_WINDOWS.LIST) {
      if (key.upArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => Math.min(currentList.length - 1, prev + 1)); return; }
    }
    if (page === PAGES.SKILL) {
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
        if (action === 'remove') {
          setPendingRemove(selectedItem);
        } else if (action === 'restore') {
          try {
            configManager.restoreMcpServer(selectedItem);
            refreshData();
            setMessage(`已恢复 ${selectedItem}`);
          } catch (err) {
            setError(err.message);
          }
        }
        return;
      }
    }

    // ── MCP 快速暂时移除（d 键）— 进入确认态 ────────────
    if (page === PAGES.MCP && input === 'd' && selectedItem) {
      setPendingRemove(selectedItem);
      return;
    }

    // ── Skills 暂时移除 / 恢复 ──────────────────────────
    if (page === PAGES.SKILL && selectedItem && key.return) {
      try {
        const wasDisabled = skills[selectedItem]?.disabled;
        if (wasDisabled) {
          configManager.restoreSkill(selectedItem);
          refreshData();
          setMessage(`已恢复 ${skills[selectedItem]?.name}`);
        } else {
          configManager.removeSkill(selectedItem);
          refreshData();
          setMessage(`已暂时移除 ${skills[selectedItem]?.name}（按 Restore 可恢复）`);
        }
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    // 全局刷新
    if (input === 'r') { refreshData(); setMessage('已刷新'); return; }
  });

  // ── 渲染 ──────────────────────────────────────────────
  // 尺寸来自 resize 订阅（useTerminalSize），窗口拉伸即时重排
  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();
  const meta = PAGE_META[page];

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      {/* ── Top Bar: 页面胶囊 Tab + 消息 ─────────────────── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        {Object.values(PAGE_META).map(p => {
          const active = p.num === meta.num;
          return (
            <Text
              key={p.label}
              bold={active}
              backgroundColor={active ? p.color : undefined}
              color={active ? THEME.onAccent : THEME.faint}
            >
              {` ${p.num} ${p.label} `}
            </Text>
          );
        })}
        <Box flexGrow={1} />
        {error && <Text bold color={THEME.dangerBright}>✗ {error}</Text>}
        {!error && message && <Text bold color={THEME.successBright}>✓ {message}</Text>}
      </Box>

      <Box height={1} paddingX={1}>
        <Text color={THEME.border}>{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>

      {/* ── Content: 按 page 条件渲染对应页面组件 ────────── */}
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
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
        {page === PAGES.MCP && (
          <MCPPage
            mcpServers={mcpServers}
            selectedItem={selectedItem}
            selectedIndex={selectedIndex}
            detailMenuIndex={detailMenuIndex}
            detailMenu={detailMenu}
            activeWindow={activeWindow}
            pendingRemove={pendingRemove}
            terminalWidth={terminalWidth}
            terminalHeight={terminalHeight}
          />
        )}
        {page === PAGES.SKILL && (
          <SKILLPage
            skills={skills}
            selectedItem={selectedItem}
            selectedIndex={selectedIndex}
            terminalWidth={terminalWidth}
            terminalHeight={terminalHeight}
          />
        )}
        {page === PAGES.SETTING && (
          <SETTINGPage claudeDetected={configManager?.isAvailable()} />
        )}
      </Box>

      <Box height={1} paddingX={1}>
        <Text color={THEME.border}>{'─'.repeat(terminalWidth - 2)}</Text>
      </Box>

      {/* ── Bottom Bar: 键帽式快捷键提示 ────────────────── */}
      <Box height={1} flexDirection="row" alignItems="center" paddingX={1}>
        {(FOOTER_HINTS[page] || []).map(([k, label]) => (
          <Box key={k} flexDirection="row" marginRight={2}>
            <Text bold backgroundColor={THEME.chipBg} color={THEME.infoBright}>{` ${k} `}</Text>
            <Text color={THEME.faint}>{` ${label}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
