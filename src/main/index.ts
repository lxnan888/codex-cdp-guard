import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { CdpMonitor } from './cdp-monitor'
import { DEFAULT_MONITOR_CONFIG, type MonitorConfig } from '../shared/types'

const monitor = new CdpMonitor(DEFAULT_MONITOR_CONFIG)

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function registerIpc(): void {
  ipcMain.handle('monitor:start', (_event, config?: MonitorConfig) => monitor.start(config))
  ipcMain.handle('monitor:stop', () => monitor.stop())
  ipcMain.handle('monitor:get-status', () => monitor.getStatus())
  ipcMain.handle('monitor:update-config', (_event, config: MonitorConfig) =>
    monitor.updateConfig(config)
  )

  monitor.on('status', (status) => broadcast('monitor:status-changed', status))
  monitor.on('monitor-event', (event) => broadcast('monitor:event', event))
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
})

app.on('before-quit', () => {
  monitor.stop()
})

app.on('window-all-closed', () => {
  monitor.stop()
  app.quit()
})
