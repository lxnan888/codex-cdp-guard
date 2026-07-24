import { EventEmitter } from 'node:events'
import WebSocket, { type RawData } from 'ws'
import {
  DEFAULT_MONITOR_CONFIG,
  type MonitorConfig,
  type MonitorEvent,
  type MonitorEventLevel,
  type MonitorMessage,
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

export class MonitorError extends Error {
  constructor(readonly monitorMessage: MonitorMessage) {
    super(monitorMessage.key)
    this.name = 'MonitorError'
  }
}

function monitorMessage(
  key: MonitorMessage['key'],
  params?: MonitorMessage['params']
): MonitorMessage {
  return params ? { key, params } : { key }
}

export function toMonitorMessage(error: unknown): MonitorMessage {
  if (error instanceof MonitorError) return error.monitorMessage
  if (error instanceof Error) {
    if (error.name === 'AbortError') return monitorMessage('cdp.timeout')
    return monitorMessage('error.raw', { detail: error.message })
  }
  return monitorMessage('error.raw', { detail: String(error) })
}

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
    throw new MonitorError(monitorMessage('config.host.invalid'))
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new MonitorError(monitorMessage('config.port.invalid'))
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 5_000) {
    throw new MonitorError(monitorMessage('config.pollInterval.invalid'))
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
  private errorMessage: MonitorMessage | null = null
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
        ? {
            ...this.errorMessage,
            params: this.errorMessage.params ? { ...this.errorMessage.params } : undefined
          }
        : null
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
    this.emitEvent('info', monitorMessage('monitor.started'))
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
      this.emitEvent('info', monitorMessage('monitor.stopped'))
    }
    this.emitStatus()
    return this.getStatus()
  }

  updateConfig(config: MonitorConfig): MonitorStatus {
    this.config = validateMonitorConfig(config)
    this.emitEvent(
      'info',
      monitorMessage('config.updated', { address: `${this.config.host}:${this.config.port}` })
    )

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
        throw new MonitorError(monitorMessage('target.notFound'))
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

      this.emitEvent(
        'success',
        monitorMessage('target.connected', { title: this.targetTitle })
      )
      this.emitStatus()
      this.schedulePoll(0)
    } catch (error) {
      if (!this.monitoring || expectedGeneration !== this.generation) return
      this.handleConnectionFailure(toMonitorMessage(error))
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
        throw new MonitorError(monitorMessage('cdp.listFailed', { status: response.status }))
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
      this.handleConnectionFailure(monitorMessage('cdp.disconnected'))
    })
    socket.on('error', (error) => {
      if (this.socket !== socket) return
      this.errorMessage = toMonitorMessage(error)
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
      pending.reject(
        new MonitorError(
          message.error.message
            ? monitorMessage('cdp.commandFailedWithDetail', { detail: message.error.message })
            : monitorMessage('cdp.commandFailed')
        )
      )
    } else {
      pending.resolve(message.result)
    }
  }

  private sendCommand<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new MonitorError(monitorMessage('cdp.socketNotConnected')))
    }

    const id = ++this.commandId
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id)
        reject(new MonitorError(monitorMessage('cdp.commandTimeout', { method })))
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
        throw new MonitorError(monitorMessage('cdp.scriptFailed'))
      }

      const result = response.result?.value
      if (result?.triggered) {
        this.stats.detections += 1
        this.stats.snoozes += 1
        this.emitEvent('success', monitorMessage('prompt.detected'))
        this.emitStatus()
      }
      this.schedulePoll(this.config.pollIntervalMs)
    } catch (error) {
      if (!this.monitoring) return
      this.handleConnectionFailure(toMonitorMessage(error))
    }
  }

  private handleConnectionFailure(message: MonitorMessage): void {
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
      pending.reject(new MonitorError(monitorMessage('cdp.closed')))
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

  private emitEvent(level: MonitorEventLevel, message: MonitorMessage): void {
    const event: MonitorEvent = {
      id: `${Date.now()}-${++this.eventId}`,
      timestamp: Date.now(),
      level,
      message
    }
    this.emit('monitor-event', event)
  }

}
