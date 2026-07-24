import { contextBridge, ipcRenderer } from 'electron'
import type { CodexGuardApi, MonitorConfig, MonitorEvent, MonitorStatus } from '../shared/types'

const api: CodexGuardApi = {
  startMonitor: (config?: MonitorConfig) => ipcRenderer.invoke('monitor:start', config),
  stopMonitor: () => ipcRenderer.invoke('monitor:stop'),
  getMonitorStatus: () => ipcRenderer.invoke('monitor:get-status'),
  updateConfig: (config: MonitorConfig) => ipcRenderer.invoke('monitor:update-config', config),
  onStatusChanged: (callback: (status: MonitorStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: MonitorStatus): void => callback(status)
    ipcRenderer.on('monitor:status-changed', listener)
    return () => ipcRenderer.removeListener('monitor:status-changed', listener)
  },
  onMonitorEvent: (callback: (event: MonitorEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: MonitorEvent): void => callback(event)
    ipcRenderer.on('monitor:event', listener)
    return () => ipcRenderer.removeListener('monitor:event', listener)
  }
}

contextBridge.exposeInMainWorld('codexGuard', api)
