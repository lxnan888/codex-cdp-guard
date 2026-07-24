import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import {
  CdpMonitor,
  selectCodexTarget,
  validateMonitorConfig
} from '../src/main/cdp-monitor'

interface FakeCdpServer {
  port: number
  methods: string[]
  getConnectionCount: () => number
  closeFirstConnection: () => void
  close: () => Promise<void>
}

const openServers: FakeCdpServer[] = []

async function createFakeCdpServer(): Promise<FakeCdpServer> {
  const methods: string[] = []
  let connectionCount = 0
  let firstConnection: import('ws').WebSocket | null = null
  const server: Server = createServer((request, response) => {
    if (request.url !== '/json/list') {
      response.writeHead(404).end()
      return
    }

    const address = server.address() as AddressInfo
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify([
        {
          id: 'test-page',
          title: 'Codex',
          type: 'page',
          url: 'app://-/index.html',
          webSocketDebuggerUrl: `ws://127.0.0.1:${address.port}/devtools/page/test-page`
        }
      ])
    )
  })

  const webSocketServer = new WebSocketServer({
    server,
    path: '/devtools/page/test-page'
  })

  webSocketServer.on('connection', (socket) => {
    connectionCount += 1
    if (!firstConnection) firstConnection = socket

    socket.on('message', (rawMessage) => {
      const message = JSON.parse(rawMessage.toString()) as {
        id: number
        method: string
      }
      methods.push(message.method)

      if (message.method === 'Runtime.evaluate') {
        const firstEvaluation = methods.filter((method) => method === 'Runtime.evaluate').length === 1
        socket.send(
          JSON.stringify({
            id: message.id,
            result: {
              result: {
                type: 'object',
                value: { present: true, triggered: firstEvaluation }
              }
            }
          })
        )
        return
      }

      socket.send(JSON.stringify({ id: message.id, result: {} }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const fakeServer: FakeCdpServer = {
    port: (server.address() as AddressInfo).port,
    methods,
    getConnectionCount: () => connectionCount,
    closeFirstConnection: () => firstConnection?.close(),
    close: async () => {
      for (const client of webSocketServer.clients) client.terminate()
      await new Promise<void>((resolve) => webSocketServer.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
  openServers.push(fakeServer)
  return fakeServer
}

async function waitFor(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('等待测试条件超时')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()))
})

describe('CDP 目标选择', () => {
  it('只选择 Codex 主页面', () => {
    const target = selectCodexTarget([
      {
        id: 'other',
        title: 'Other',
        type: 'page',
        url: 'https://example.com',
        webSocketDebuggerUrl: 'ws://127.0.0.1/other'
      },
      {
        id: 'codex',
        title: 'Codex',
        type: 'page',
        url: 'app://-/index.html',
        webSocketDebuggerUrl: 'ws://127.0.0.1/codex'
      }
    ])

    expect(target?.id).toBe('codex')
  })
})

describe('监控配置', () => {
  it('拒绝无效端口和过快轮询', () => {
    expect(() =>
      validateMonitorConfig({ host: '127.0.0.1', port: 70_000, pollIntervalMs: 250 })
    ).toThrow('端口')
    expect(() =>
      validateMonitorConfig({ host: '127.0.0.1', port: 9229, pollIntervalMs: 50 })
    ).toThrow('轮询间隔')
  })
})

describe('CdpMonitor', () => {
  it('连接、触发一次询问交互并在停止后停止轮询', async () => {
    const fakeServer = await createFakeCdpServer()
    const monitor = new CdpMonitor({
      host: '127.0.0.1',
      port: fakeServer.port,
      pollIntervalMs: 100
    })

    monitor.start()
    await waitFor(() => monitor.getStatus().stats.snoozes === 1)

    expect(monitor.getStatus().connectionState).toBe('connected')
    expect(fakeServer.methods).toContain('Runtime.enable')
    expect(fakeServer.methods).toContain('Runtime.evaluate')

    await new Promise((resolve) => setTimeout(resolve, 240))
    expect(monitor.getStatus().stats.snoozes).toBe(1)

    monitor.stop()
    const commandCountAfterStop = fakeServer.methods.length
    await new Promise((resolve) => setTimeout(resolve, 180))

    expect(fakeServer.methods).toHaveLength(commandCountAfterStop)
    expect(monitor.getStatus().connectionState).toBe('idle')
  })

  it('CDP 断线后自动重新连接', async () => {
    const fakeServer = await createFakeCdpServer()
    const monitor = new CdpMonitor({
      host: '127.0.0.1',
      port: fakeServer.port,
      pollIntervalMs: 100
    })

    monitor.start()
    await waitFor(() => monitor.getStatus().connectionState === 'connected')
    fakeServer.closeFirstConnection()
    await waitFor(() => fakeServer.getConnectionCount() >= 2)

    expect(monitor.getStatus().stats.connectionFailures).toBeGreaterThanOrEqual(1)
    monitor.stop()
  })
})
