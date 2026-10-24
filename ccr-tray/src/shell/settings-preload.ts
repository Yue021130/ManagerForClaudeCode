import { contextBridge, ipcRenderer } from "electron";

// 设置窗口渲染进程桥：主进程推状态，渲染进程发动作事件
contextBridge.exposeInMainWorld("ccrSettings", {
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on("settings:state", (_e, s) => cb(s));
  },
  send: (event: unknown) => {
    ipcRenderer.send("settings:event", event);
  },
});
