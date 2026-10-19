import type { StatusInfo } from "./types";

export const GATEWAY_PORT = 40229;
export const MANAGEMENT_PORT = 3458;

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

/** 轮询一次服务状态。先探测网关口，再探测管理口。 */
export async function checkStatus(): Promise<StatusInfo> {
  const gatewayOk = await probe(GATEWAY_PORT);
  const mgmtOk = gatewayOk ? true : await probe(MANAGEMENT_PORT);
  return {
    state: gatewayOk ? "running" : mgmtOk ? "partial" : "stopped",
    managementUrl: `http://127.0.0.1:${MANAGEMENT_PORT}/`,
    gatewayOk,
    checkedAt: Date.now(),
  };
}
