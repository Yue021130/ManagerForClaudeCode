import { readSettings } from "./settings";
import type { StatusInfo } from "./types";

const probeTimeoutMs = 1200;

async function probe(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    return res.ok || res.status === 404; // 404 也说明端口在活
  } catch {
    return false;
  }
}

/** 轮询一次服务状态。先探测网关口，再探测管理口。端口每次从托盘配置读。 */
export async function checkStatus(): Promise<StatusInfo> {
  const { managementPort, gatewayPort } = readSettings();
  const gatewayOk = await probe(gatewayPort);
  const mgmtOk = gatewayOk ? true : await probe(managementPort);
  return {
    state: gatewayOk ? "running" : mgmtOk ? "partial" : "stopped",
    managementUrl: `http://127.0.0.1:${managementPort}/`,
    gatewayOk,
    checkedAt: Date.now(),
  };
}
