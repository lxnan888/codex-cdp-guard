export interface MonitorConfig {
  host: string
  port: number
  pollIntervalMs: number
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
  errorMessage: string | null
}

export type MonitorEventLevel = 'info' | 'success' | 'warning' | 'error'

export interface MonitorEvent {
  id: string
  timestamp: number
  level: MonitorEventLevel
  message: string
}

export interface CodexGuardApi {
  startMonitor: (config?: MonitorConfig) => Promise<MonitorStatus>
  stopMonitor: () => Promise<MonitorStatus>
  getMonitorStatus: () => Promise<MonitorStatus>
  updateConfig: (config: MonitorConfig) => Promise<MonitorStatus>
  onStatusChanged: (callback: (status: MonitorStatus) => void) => () => void
  onMonitorEvent: (callback: (event: MonitorEvent) => void) => () => void
}

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  host: '127.0.0.1',
  port: 9229,
  pollIntervalMs: 250
}
