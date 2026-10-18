import type { AppInfo } from "@ccr/core/contracts/app";

type AppPaths = Pick<AppInfo, "chatgptAppPath" | "opencodeAppPath" | "workbuddyAppPath">;

export function createAppInfoPathReader(load: () => AppPaths, now: () => number = Date.now): () => AppPaths {
  let cached: AppPaths | undefined;
  let expiresAt = 0;
  return () => {
    if (!cached || now() >= expiresAt) {
      cached = load();
      expiresAt = now() + 30_000;
    }
    return { ...cached };
  };
}

// Launchers still discover afresh; only the informational RPC uses this cache.
// CCR patch: skip desktop-app discovery for the informational RPC. The
// discovery spawns several synchronous PowerShell subprocesses, which can
// stall the management server's event loop for tens of seconds. The values
// are only informational; launchers still discover afresh when needed.
export const getAppInfoPaths = createAppInfoPathReader(() => ({
  chatgptAppPath: "",
  opencodeAppPath: "",
  workbuddyAppPath: ""
}));
