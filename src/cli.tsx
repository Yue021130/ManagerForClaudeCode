// 核心：“内核”和“渲染器”分开。计算逻辑和diff生成虚拟树是内核，画到哪里是渲染器。
// Yue021130：内核->后端 |  渲染器->前端

/**
 * CLI 入口 — 唯一职责：串联 启动页 → Ink 应用 → 退出画面
 * Ink 是 "React for terminals"，把 JSX 转成 ANSI 终端输出
 *
 * ── 和浏览器渲染的本质对比 ──────────────────────────────
 * 本质是一样的：React 内核（组件 / state / diff）与渲染目标解耦，
 * 差别只在最后一公里"树变成什么"：
 *
 *   浏览器:  ReactDOM.createRoot(node).render(<App/>)
 *            虚拟 DOM → 真实 DOM 节点(div/span) → CSS 布局 → 像素
 *
 *   终端:    render(<App/>)  ← 来自 ink 而不是 react-dom
 *            虚拟 DOM → 文本节点树 → yoga flexbox 布局 → ANSI 转义序列
 *
 * 相同点:
 *   - 同一个 React 内核,同一套组件/JSX/Hooks/状态驱动重渲染模型
 *   - 都靠 reconciliation(diff) 只更新变化的部分,而不是整屏重画
 *   - 布局都用 flexbox —— Ink 内置 yoga(和 React Native 同款布局引擎),
 *     所以 <Box flexDirection="row"> 写起来和 CSS flex 几乎一一对应
 * 不同点:
 *   - 输出介质: 像素画布 vs 字符网格(没有像素,样式只有颜色/加粗等 ANSI 码)
 *   - 事件来源: DOM 事件(onClick/onChange) vs stdin 按键(本项目用 useInput)
 *   - 无持久实体: DOM 节点常驻可查询,终端只是被反复覆写的字符流
 */
// 这里的 render 来自 ink —— 相当于浏览器的 ReactDOM,只是   渲染器换了后端
import { render } from 'ink';
import App from './App.js';
import { playSplash } from './shell/splash.js';
import { playGoodbye } from './shell/goodbye.js';



// 生命周期三段式：
//   启动页（splash）→ App 运行 → 退出画面（goodbye）
// splash/goodbye 都是纯 ANSI 直写 stdout，不经过 Ink；
const startTime = Date.now();  // CLI启动时间

/*
*
   关键理解 await playSplash() 这一行：

   ```
     程序跑到这里 → playSplash() 开始执行
         ↓
     渐显（4 次 frame + sleep(90) 串行）    ← 这是循环，但用的是同步 await sleep，所以每 90ms 一帧
         ↓
     定格等待：setInterval 每 450ms 画一帧   ← Promise 挂起，但定时器在后台活着！
         ↓（用户按回车 → resolve()）
     淡出（2 次 frame + sleep(90) 串行）
         ↓
     函数 return → await 放行 → 继续走 cli.tsx 下一行（render App）
   ```
* */
await playSplash();  // 启动页画面

// render() 挂载 <App/> 到终端,接管 stdout/stdin
// Ink 自动处理: 只重绘变化行(ANSI 光标控制)、stdin 原始模式捕获按键、
const { waitUntilExit } = render(<App />);
await waitUntilExit();

await playGoodbye({ durationMs: Date.now() - startTime }); // 结束页画面

/**
 *  ● render() 返回的不是一个函数，是一个对象，这个对象里带着几个方法，我们只用了解构出来的 waitUntilExit。
 *  关键问题是：为什么render() 要把这些东西「带回来」给你？
 *
 *    1. render() 启动的是一个「长跑进程」
 *
 *    看 render(<App />) 这一行干了什么：它把 React 应用挂到终端上，从此刻起这个应用就一直活着——监听键盘、更新界面、响应用户操作。它不像普通函数那
 *    样「算完就 return」，而是一个持续运行的东西。
 *
 *    所以 render() 必须返回一个句柄（handle）——你握着这个句柄，才能对那个正在运行的应用说话。就像：
 *
 *    ```ts
 *      const timer = setInterval(cb, 1000);
 *      // ↑ 这个"闹钟"也是长跑的，所以 setInterval 也返回一个句柄（timer）
 *      //   你以后要靠 timer 来 clearInterval(timer)
 *    ```
 *
 *    Ink 的 render() 返回的对象类似这样（简化）：
 *
 *    ```ts
 *      {
 *        waitUntilExit: () => Promise<void>,   // ← 我们用的：等应用退出
 *        unmount: () => void,                  // 手动卸载
 *        rerender: (node) => void,             // 强制重渲染
 *        cleanup: () => void,                  // 清理
 *      }
 *    ```
 *
 *    2. 为什么需要 waitUntilExit？
 *
 *    看我们的使用场景：
 *
 *    ```ts
 *      const { waitUntilExit } = render(<App />);  // 应用挂上去了，一直跑着
 *      await waitUntilExit();                       // 在这里等"应用退出"这个事件
 *      // ↓ 应用真的退出了，才往下走（playGoodbye）
 *    ```
 *
 *    问题：render() 这一行执行完时，App 才刚挂载，用户还正用着它。但我们想表达的是「等用户退出 App 后，再去放退出动画」。这是个典型的「等事件」——
 *    和 splash.ts 里等回车完全一样。
 *
 *    所以 Ink 给了 waitUntilExit()：它返回一个 Promise，App 卸载（用户按 Esc）时 resolve。你 await 它，程序就挂在那，直到 App 结束。
 *
 *    没有它的话，你就只能把后续代码塞进回调里（回调地狱，前面讲 Promise 那轮说过）。有了它，代码保持线性时间线：
 *
 *    ```ts
 *      await playSplash();        // 1. 启动页播完
 *      await waitUntilExit();     // 2. App 运行，直到用户退出
 *      await playGoodbye(...);    // 3. 然后放退出动画
 *    ```
 *
 *    3. 从设计角度：为什么不直接把「退出事件」做成回调？
 *
 *    ```ts
 *      // 假如 Ink 设计成回调式：
 *      render(<App />, { onExit: () => playGoodbye(...) });  // 难看，逻辑散了
 *    ```
 *
 *    返回句柄 + Promise 的好处：
 *
 *    • 调用方掌握控制权：什么时候等、在哪个线程等、要不要同时做别的事，都由 cli.tsx 决定，而不是被 Ink 写死
 *    • 可组合：await waitUntilExit() 可以和其他 Promise 一起用（Promise.race 等）
 *    • 职责分离：Ink 只负责「告诉你发生了」，cli.tsx 决定「发生后做什么」
 *
 *    一句话
 *
 *    render() 返回的不是数据，是一个「遥控器」——因为 React 应用挂载后是持续运行的东西，你必须拿着遥控器才能对它下指令（等待退出、卸载、清理）。
 *    waitUntilExit() 就是遥控器上「等它退场」那个按钮，按下去（await）就挂起，直到用户退出才放行。
 * */
