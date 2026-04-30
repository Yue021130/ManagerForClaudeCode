#!/usr/bin/env node
/**
 * CLI 入口 — 唯一职责是用 Ink 渲染 React 应用到终端
 * Ink 是 "React for terminals"，把 JSX 转成 ANSI 终端输出
 */
import React from 'react';
import { render } from 'ink';
import App from './App.js';

// render() 挂载 <App/> 到终端，接管 stdout
// Ink 自动处理全屏刷新、键盘输入等终端特性
render(<App />);
