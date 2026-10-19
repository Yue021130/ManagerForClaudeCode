import { contextBridge, ipcRenderer } from "electron";

// 自绘菜单渲染进程桥：主进程推状态，渲染进程发菜单事件
contextBridge.exposeInMainWorld("ccrMenu", {
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on("menu:state", (_e, s) => cb(s));
  },
  send: (event: unknown) => {
    ipcRenderer.send("menu:event", event);
  },
});
