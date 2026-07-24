export interface MonitorConfig {
  host: string
  port: number
  pollIntervalMs: number
}

export type MonitorMessageKey =
  | 'config.host.invalid'
  | 'config.port.invalid'
  | 'config.pollInterval.invalid'
  | 'monitor.started'
  | 'monitor.stopped'
  | 'config.updated'
  | 'target.notFound'
  | 'target.connected'
  | 'cdp.listFailed'
  | 'cdp.disconnected'
  | 'cdp.commandFailed'
  | 'cdp.commandFailedWithDetail'
  | 'cdp.socketNotConnected'
  | 'cdp.commandTimeout'
  | 'cdp.scriptFailed'
  | 'prompt.detected'
  | 'cdp.closed'
  | 'cdp.timeout'
  | 'error.raw'

export interface MonitorMessage {
  key: MonitorMessageKey
  params?: Record<string, string | number>
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export interface MonitorStats {
  detections: number
  snoozes: number
  connectionFailures: number
}

export interface MonitorStatus {
  monitoring: boolean
  connectionState: ConnectionState
  config: MonitorConfig
  stats: MonitorStats
  targetTitle: string | null
  targetUrl: string | null
  errorMessage: MonitorMessage | null
}

export type MonitorEventLevel = 'info' | 'success' | 'warning' | 'error'

export interface MonitorEvent {
  id: string
  timestamp: number
  level: MonitorEventLevel
  message: MonitorMessage
}

export type MonitorActionResult =
  | { ok: true; status: MonitorStatus }
  | { ok: false; error: MonitorMessage }

export interface CodexGuardApi {
  startMonitor: (config?: MonitorConfig) => Promise<MonitorActionResult>
  stopMonitor: () => Promise<MonitorStatus>
  getMonitorStatus: () => Promise<MonitorStatus>
  updateConfig: (config: MonitorConfig) => Promise<MonitorActionResult>
  onStatusChanged: (callback: (status: MonitorStatus) => void) => () => void
  onMonitorEvent: (callback: (event: MonitorEvent) => void) => () => void
}

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  host: '127.0.0.1',
  port: 9229,
  pollIntervalMs: 250
}
