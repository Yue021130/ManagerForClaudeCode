/**
 * resume.ts — 会话恢复（ss 键功能）的进程层
 *
 * 两条路径：
 * - 新开终端窗口：wt 优先（用户在 Windows Terminal），fallback cmd /c start；
 *   detached + unref，拉起即走，不阻塞管理器
 * - 当前终端恢复：stdio: 'inherit' 把终端完整交给 claude 并等它退出（cli.tsx 调用）
 *
 * 恢复命令固定 `claude --resume <sessionId>`（直连；ccr 路由名称会话同样按 id 恢复）。
 * spawn 的 cwd 必须是会话所属项目目录——Claude Code 按 cwd 定位会话文件。
 */
import { spawn } from 'node:child_process';
import type { SessionMeta } from './types.js';
import { loadConfig } from '../../config.js';

// ── 恢复请求通道：HISTORYPage 设置 → App 退出后 cli.tsx 取走执行 ──
// （当前终端恢复必须先卸载 Ink 再拉起 claude，只能借 App 退出流程接力）
let pendingResume: SessionMeta | null = null;

export const requestResume = (s: SessionMeta): void => {
  pendingResume = s;
};

export const takePendingResume = (): SessionMeta | null => {
  const r = pendingResume;
  pendingResume = null;
  return r;
};

// ── wt（Windows Terminal）探测：一次探测，模块级缓存 ──
let wtAvailable: Promise<boolean> | null = null;
const hasWt = (): Promise<boolean> => {
  wtAvailable ??= new Promise<boolean>((resolve) => {
    const p = spawn('where', ['wt'], { shell: true, stdio: 'ignore' });
    childOk(resolve, p);
  });
  return wtAvailable;
};

const childOk = (resolve: (ok: boolean) => void, p: ReturnType<typeof spawn>): void => {
  p.on('close', (code) => resolve(code === 0));
  p.on('error', () => resolve(false));
};

/** 新开终端窗口恢复；拉起失败抛错由调用方提示 */
export async function spawnResumeNewWindow(s: SessionMeta): Promise<void> {
  if (!s.cwd) throw new Error('该会话没有记录项目路径，无法恢复');
  // 设置页指定了终端模板就用模板（{cwd}/{cmd} 占位符原样替换，引号由模板自己控制）
  const tpl = loadConfig().terminalTemplate.trim();
  if (tpl) {
    const cmdline = tpl
      .replaceAll('{cwd}', s.cwd)
      .replaceAll('{cmd}', `claude --resume ${s.sessionId}`);
    spawn(cmdline, { shell: true, detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const args = ['--resume', s.sessionId];
  if (await hasWt()) {
    // cmd /k：claude 退出后窗口不闪退，留 cmd 提示符；--title 固定窗口名（否则显示成 pwsh/cmd）
    spawn('wt', ['--title', 'Claude', '-d', s.cwd, 'cmd', '/k', 'claude', ...args], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  } else {
    // start "Claude" /D <cwd>：第一个引号参数是窗口标题
    spawn('cmd', ['/c', 'start', '"Claude"', '/D', s.cwd, 'cmd', '/k', 'claude', ...args], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }
}

/** 当前终端恢复：把 stdio 整个交给 claude，等它退出后才返回（node 进程不退出，外壳 shell 不会抢回 stdin） */
export async function runResumeInPlace(s: SessionMeta): Promise<void> {
  if (!s.cwd) throw new Error('该会话没有记录项目路径，无法恢复');
  await new Promise<void>((resolve) => {
    // shell: true——Windows 上 claude 是 claude.cmd，直接 spawn 会 ENOENT
    const p = spawn('claude', ['--resume', s.sessionId], {
      cwd: s.cwd as string,
      stdio: 'inherit',
      shell: true
    });
    p.on('close', () => resolve());
    p.on('error', () => resolve()); // 拉起失败也返回，让 App 重新挂载报错也有界面
  });
}
