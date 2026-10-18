const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nurim',Object.freeze({
  init:()=>ipcRenderer.invoke('init'), send:question=>ipcRenderer.invoke('send',question), stop:()=>ipcRenderer.invoke('stop'),
  reset:()=>ipcRenderer.invoke('reset'), settings:()=>ipcRenderer.invoke('settings'), saveSettings:value=>ipcRenderer.invoke('save-settings',value),
  hide:()=>ipcRenderer.invoke('hide'), toggle:()=>ipcRenderer.invoke('toggle'), quit:()=>ipcRenderer.invoke('quit'),
  copy:text=>ipcRenderer.invoke('copy',text), exportChat:()=>ipcRenderer.invoke('export'),
  checkUpdate:()=>ipcRenderer.invoke('check-update'), installUpdate:()=>ipcRenderer.invoke('install-update'),
  openLink:name=>ipcRenderer.invoke('open-link',name),
  movePet:point=>ipcRenderer.invoke('move-pet',point),
  attachPick:()=>ipcRenderer.invoke('attach-pick'), attachData:(name,data)=>ipcRenderer.invoke('attach-data',name,data),
  attachScreen:()=>ipcRenderer.invoke('attach-screen'), attachRemove:id=>ipcRenderer.invoke('attach-remove',id),
  onUpdate:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('update-status',listener);return ()=>ipcRenderer.removeListener('update-status',listener);}
}));
