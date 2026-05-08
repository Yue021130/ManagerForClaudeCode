## 1.React的`render(<App />);`

React 从设计上就把“内核”和“渲染器”分开了——组件、state、diff 这些核心逻辑完全不关心最终画到哪里，只负责生成一棵虚拟树并算出变化；画到哪是渲染器的事：

- **浏览器**：`react-dom` 把虚拟树转成真实的 DOM 节点（div/span），交给 CSS 布局，最后浏览器绘成像素
- **终端**：Ink 把同一棵虚拟树转成文本节点，用 yoga（和 React Native 同款的 flexbox 引擎）算布局，最后输出 ANSI 转义序列到 stdout

所以你会看到两边惊人地对称：`<Box flexDirection="row">` 约等于 CSS 的 `display: flex; flex-direction: row`；`render(<App/>)` 约等于 `createRoot(...).render(<App/>)`；状态变了都是走 reconciliation 只更新差异，而不是整屏重画。

真正的差别只有三点，都来自“介质”不同：

1. **输出介质**：浏览器是像素画布，终端是字符网格——所以没有圆角、没有字号，样式只剩颜色/加粗这些 ANSI 码能表达的东西
2. **事件来源**：浏览器是 DOM 事件（`onClick` 等），终端是 stdin 的按键流，所以这个项目用 `useInput` 而不是 `onClick`
3. **无持久实体**：DOM 节点是常驻、可查询的对象；终端只是一条被反复覆写的字符流，Ink 全屏重绘时靠 ANSI 光标控制只重写变化的行

理解了这一点，这个项目里所有 React 知识就都能复用了——你写 `useState`、props、组件拆分的方式和在网页里完全相同，唯一要换的脑子就是“我在往一个字符网格上排版”。
