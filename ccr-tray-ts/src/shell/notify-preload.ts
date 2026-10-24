import { contextBridge, ipcRenderer } from "electron";

// 通知弹窗渲染进程桥：主进程推通知内容，渲染进程发动作事件
contextBridge.exposeInMainWorld("ccrNotify", {
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on("notify:state", (_e, s) => cb(s));
  },
  send: (event: unknown) => {
    ipcRenderer.send("notify:event", event);
  },
});
