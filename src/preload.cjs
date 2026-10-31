const { contextBridge, ipcRenderer } = require('electron');
const listen = channel => callback => { const listener = (_event, data) => callback(data); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('nurim',Object.freeze({
  init:()=>ipcRenderer.invoke('init'), send:question=>ipcRenderer.invoke('send',question), stop:()=>ipcRenderer.invoke('stop'),
  sendVoice:(wav,seconds)=>ipcRenderer.invoke('send-voice',wav,seconds), speak:text=>ipcRenderer.invoke('speak',text), micAccess:()=>ipcRenderer.invoke('mic-access'),
  petMood:state=>ipcRenderer.invoke('pet-mood',state),
  reset:()=>ipcRenderer.invoke('reset'), settings:()=>ipcRenderer.invoke('settings'), saveSettings:value=>ipcRenderer.invoke('save-settings',value),
  hide:()=>ipcRenderer.invoke('hide'), toggle:()=>ipcRenderer.invoke('toggle'), quit:()=>ipcRenderer.invoke('quit'),
  copy:text=>ipcRenderer.invoke('copy',text), exportChat:()=>ipcRenderer.invoke('export'),
  docOpen:file=>ipcRenderer.invoke('doc-open',file), docShow:file=>ipcRenderer.invoke('doc-show',file),
  memory:()=>ipcRenderer.invoke('memory'), memorySet:on=>ipcRenderer.invoke('memory-set',on), memoryRemove:index=>ipcRenderer.invoke('memory-remove',index), memoryClear:()=>ipcRenderer.invoke('memory-clear'),
  checkUpdate:()=>ipcRenderer.invoke('check-update'), installUpdate:()=>ipcRenderer.invoke('install-update'),
  openLink:name=>ipcRenderer.invoke('open-link',name),
  movePet:point=>ipcRenderer.invoke('move-pet',point), petActive:()=>ipcRenderer.invoke('pet-active'),
  historyList:query=>ipcRenderer.invoke('history-list',query), historyOpen:id=>ipcRenderer.invoke('history-open',id),
  historyDelete:id=>ipcRenderer.invoke('history-delete',id), historyClear:()=>ipcRenderer.invoke('history-clear'),
  practice:()=>ipcRenderer.invoke('practice'), practiceGenerate:options=>ipcRenderer.invoke('practice-generate',options),
  practiceDue:deckId=>ipcRenderer.invoke('practice-due',deckId), practiceReview:(deckId,cardId,grade)=>ipcRenderer.invoke('practice-review',deckId,cardId,grade),
  practiceQuizDone:result=>ipcRenderer.invoke('practice-quiz-done',result), practiceDeckDelete:id=>ipcRenderer.invoke('practice-deck-delete',id),
  practiceOptions:value=>ipcRenderer.invoke('practice-options',value), practiceMood:state=>ipcRenderer.invoke('practice-mood',state),
  reminderAdd:value=>ipcRenderer.invoke('reminder-add',value), reminderDelete:id=>ipcRenderer.invoke('reminder-delete',id),
  attachPick:()=>ipcRenderer.invoke('attach-pick'), attachData:(name,data)=>ipcRenderer.invoke('attach-data',name,data),
  attachScreen:()=>ipcRenderer.invoke('attach-screen'), attachRemove:id=>ipcRenderer.invoke('attach-remove',id),
  onMood:listen('mood'), onExplain:listen('explain'), onUpdate:listen('update-status'), onPanel:listen('open-panel'), onReminder:listen('reminder')
}));
