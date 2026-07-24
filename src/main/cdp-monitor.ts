import { EventEmitter } from 'node:events'
import WebSocket, { type RawData } from 'ws'
import {
  DEFAULT_MONITOR_CONFIG,
  type MonitorConfig,
  type MonitorEvent,
  type MonitorEventLevel,
  type MonitorStatus
} from '../shared/types'

interface CdpTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface PendingCommand {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

interface RuntimeEvaluateResponse {
  result?: {
    value?: {
      present: boolean
      triggered: boolean
    }
  }
  exceptionDetails?: unknown
}

const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 5_000] as const
const COMMAND_TIMEOUT_MS = 3_000
const DISCOVERY_TIMEOUT_MS = 3_000

export function selectCodexTarget(targets: CdpTarget[]): CdpTarget | undefined {
  return targets.find(
    (target) =>
      target.type === 'page' &&
      target.url === 'app://-/index.html' &&
      typeof target.webSocketDebuggerUrl === 'string'
  )
}

export function validateMonitorConfig(config: MonitorConfig): MonitorConfig {
  const host = config.host.trim()
  const port = Number(config.port)
  const pollIntervalMs = Number(config.pollIntervalMs)

  if (!host || host.includes('://')) {
    throw new Error('主机地址不能为空，也不能包含协议前缀')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('端口必须是 1 到 65535 之间的整数')
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 5_000) {
    throw new Error('轮询间隔必须是 100 到 5000 毫秒之间的整数')
  }

  return { host, port, pollIntervalMs }
}

export class CdpMonitor extends EventEmitter {
  private config: MonitorConfig
  private monitoring = false
  private connectionState: MonitorStatus['connectionState'] = 'idle'
  private stats = { detections: 0, snoozes: 0, connectionFailures: 0 }
  private targetTitle: string | null = null
  private targetUrl: string | null = null
  private errorMessage: string | null = null
  private socket: WebSocket | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private commandId = 0
  private eventId = 0
  private generation = 0
  private sessionId = ''
  private pendingCommands = new Map<number, PendingCommand>()

  constructor(config: MonitorConfig = DEFAULT_MONITOR_CONFIG) {
    super()
    this.config = validateMonitorConfig(config)
  }

  getStatus(): MonitorStatus {
    return {
      monitoring: this.monitoring,
      connectionState: this.connectionState,
      config: { ...this.config },
      stats: { ...this.stats },
      targetTitle: this.targetTitle,
      targetUrl: this.targetUrl,
      errorMessage: this.errorMessage
    }
  }

  start(config?: MonitorConfig): MonitorStatus {
    if (config) {
      this.config = validateMonitorConfig(config)
    }
    if (this.monitoring) {
      return this.getStatus()
    }

    this.monitoring = true
    this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.reconnectAttempt = 0
    this.errorMessage = null
    this.emitEvent('info', '监控已启动，正在查找 Codex 页面')
    this.emitStatus()
    this.scheduleConnect(0)
    return this.getStatus()
  }

  stop(): MonitorStatus {
    const wasMonitoring = this.monitoring
    this.monitoring = false
    this.generation += 1
    this.clearTimers()
    this.disconnectSocket()
    this.connectionState = 'idle'
    this.targetTitle = null
    this.targetUrl = null
    this.errorMessage = null

    if (wasMonitoring) {
      this.emitEvent('info', '监控已停止')
    }
    this.emitStatus()
    return this.getStatus()
  }

  updateConfig(config: MonitorConfig): MonitorStatus {
    this.config = validateMonitorConfig(config)
    this.emitEvent('info', `连接设置已更新为 ${this.config.host}:${this.config.port}`)

    if (this.monitoring) {
      this.generation += 1
      this.clearTimers()
      this.disconnectSocket()
      this.reconnectAttempt = 0
      this.connectionState = 'disconnected'
      this.targetTitle = null
      this.targetUrl = null
      this.errorMessage = null
      this.scheduleConnect(0)
    }

    this.emitStatus()
    return this.getStatus()
  }

  private scheduleConnect(delayMs: number): void {
    if (!this.monitoring || this.reconnectTimer) return

    const expectedGeneration = this.generation
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect(expectedGeneration)
    }, delayMs)
  }

  private async connect(expectedGeneration: number): Promise<void> {
    if (!this.monitoring || expectedGeneration !== this.generation || this.socket) return

    this.connectionState = 'connecting'
    this.errorMessage = null
    this.emitStatus()

    try {
      const target = await this.discoverTarget()
      if (!this.monitoring || expectedGeneration !== this.generation) return
      if (!target?.webSocketDebuggerUrl) {
        throw new Error('未发现 Codex 页面，请确认 Codex 已启动并开放 CDP 端口')
      }

      const socket = await this.openSocket(target.webSocketDebuggerUrl)
      if (!this.monitoring || expectedGeneration !== this.generation) {
        socket.close()
        return
      }

      this.socket = socket
      this.bindSocket(socket)
      this.connectionState = 'connected'
      this.targetTitle = target.title || 'Codex'
      this.targetUrl = target.url
      this.errorMessage = null
      this.reconnectAttempt = 0
      await this.sendCommand('Runtime.enable')

      this.emitEvent('success', `已连接 Codex 页面：${this.targetTitle}`)
      this.emitStatus()
      this.schedulePoll(0)
    } catch (error) {
      if (!this.monitoring || expectedGeneration !== this.generation) return
      this.handleConnectionFailure(this.errorText(error))
    }
  }

  private async discoverTarget(): Promise<CdpTarget | undefined> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)

    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/json/list`, {
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(`CDP 页面列表请求失败：HTTP ${response.status}`)
      }
      const targets = (await response.json()) as CdpTarget[]
      return selectCodexTarget(targets)
    } finally {
      clearTimeout(timer)
    }
  }

  private openSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { handshakeTimeout: DISCOVERY_TIMEOUT_MS })

      const handleOpen = (): void => {
        socket.off('error', handleError)
        resolve(socket)
      }
      const handleError = (error: Error): void => {
        socket.off('open', handleOpen)
        socket.terminate()
        reject(error)
      }

      socket.once('open', handleOpen)
      socket.once('error', handleError)
    })
  }

  private bindSocket(socket: WebSocket): void {
    socket.on('message', (data) => this.handleMessage(data))
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.handleConnectionFailure('CDP 连接已断开')
    })
    socket.on('error', (error) => {
      if (this.socket !== socket) return
      this.errorMessage = this.errorText(error)
      this.emitStatus()
    })
  }

  private handleMessage(data: RawData): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      message = JSON.parse(data.toString()) as typeof message
    } catch {
      return
    }

    if (typeof message.id !== 'number') return
    const pending = this.pendingCommands.get(message.id)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pendingCommands.delete(message.id)
    if (message.error) {
      pending.reject(new Error(message.error.message || 'CDP 命令执行失败'))
    } else {
      pending.resolve(message.result)
    }
  }

  private sendCommand<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP WebSocket 尚未连接'))
    }

    const id = ++this.commandId
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id)
        reject(new Error(`CDP 命令超时：${method}`))
      }, COMMAND_TIMEOUT_MS)

      this.pendingCommands.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  private schedulePoll(delayMs: number): void {
    if (!this.monitoring || this.connectionState !== 'connected' || this.pollTimer) return
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      void this.poll()
    }, delayMs)
  }

  private async poll(): Promise<void> {
    if (!this.monitoring || this.connectionState !== 'connected') return

    const expression = `(() => {
      const element = document.querySelector('[data-user-input-auto-resolution]');
      if (!element) return { present: false, triggered: false };
      const key = '__codexCdpGuardSession';
      if (element[key] === ${JSON.stringify(this.sessionId)}) {
        return { present: true, triggered: false };
      }
      Object.defineProperty(element, key, {
        value: ${JSON.stringify(this.sessionId)},
        writable: true,
        configurable: true
      });
      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse'
      }));
      return { present: true, triggered: true };
    })()`

    try {
      const response = await this.sendCommand<RuntimeEvaluateResponse>('Runtime.evaluate', {
        expression,
        returnByValue: true
      })
      if (response.exceptionDetails) {
        throw new Error('Codex 页面内的检测脚本执行失败')
      }

      const result = response.result?.value
      if (result?.triggered) {
        this.stats.detections += 1
        this.stats.snoozes += 1
        this.emitEvent('success', '发现新的询问面板，已触发暂停交互')
        this.emitStatus()
      }
      this.schedulePoll(this.config.pollIntervalMs)
    } catch (error) {
      if (!this.monitoring) return
      this.handleConnectionFailure(this.errorText(error))
    }
  }

  private handleConnectionFailure(message: string): void {
    if (!this.monitoring) return
    if (this.connectionState === 'disconnected' && this.reconnectTimer) return

    this.clearPollTimer()
    this.disconnectSocket()
    this.connectionState = 'disconnected'
    this.targetTitle = null
    this.targetUrl = null
    this.errorMessage = message
    this.stats.connectionFailures += 1
    this.emitEvent('warning', message)
    this.emitStatus()

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt += 1
    this.scheduleConnect(delay)
  }

  private disconnectSocket(): void {
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.removeAllListeners()
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    }

    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('CDP 连接已关闭'))
    }
    this.pendingCommands.clear()
  }

  private clearTimers(): void {
    this.clearPollTimer()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus())
  }

  private emitEvent(level: MonitorEventLevel, message: string): void {
    const event: MonitorEvent = {
      id: `${Date.now()}-${++this.eventId}`,
      timestamp: Date.now(),
      level,
      message
    }
    this.emit('monitor-event', event)
  }

  private errorText(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') return '连接 CDP 超时'
      return error.message
    }
    return String(error)
  }
}
