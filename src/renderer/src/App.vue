<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Clock3,
  Plug,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Square,
  Unplug
} from '@lucide/vue'
import {
  DEFAULT_MONITOR_CONFIG,
  type MonitorConfig,
  type MonitorEvent,
  type MonitorStatus
} from '../../shared/types'

const status = ref<MonitorStatus>({
  monitoring: false,
  connectionState: 'idle',
  config: { ...DEFAULT_MONITOR_CONFIG },
  stats: { detections: 0, snoozes: 0, connectionFailures: 0 },
  targetTitle: null,
  targetUrl: null,
  errorMessage: null
})
const form = reactive<MonitorConfig>({ ...DEFAULT_MONITOR_CONFIG })
const events = ref<MonitorEvent[]>([])
const actionPending = ref(false)
const formError = ref('')
let unsubscribeStatus: (() => void) | undefined
let unsubscribeEvents: (() => void) | undefined

const connectionLabel = computed(() => {
  const labels: Record<MonitorStatus['connectionState'], string> = {
    idle: '未连接',
    connecting: '连接中',
    connected: '已连接',
    disconnected: '等待重连'
  }
  return labels[status.value.connectionState]
})

const connectionIcon = computed(() => {
  if (status.value.connectionState === 'connected') return Plug
  if (status.value.connectionState === 'connecting') return RefreshCw
  return Unplug
})

const connectionTone = computed(() => `status-${status.value.connectionState}`)

function syncStatus(nextStatus: MonitorStatus): void {
  status.value = nextStatus
}

function addEvent(event: MonitorEvent): void {
  events.value = [event, ...events.value].slice(0, 50)
}

async function startMonitor(): Promise<void> {
  actionPending.value = true
  formError.value = ''
  try {
    status.value = await window.codexGuard.startMonitor({ ...form })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    actionPending.value = false
  }
}

async function stopMonitor(): Promise<void> {
  actionPending.value = true
  formError.value = ''
  try {
    status.value = await window.codexGuard.stopMonitor()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    actionPending.value = false
  }
}

async function applyConfig(): Promise<void> {
  actionPending.value = true
  formError.value = ''
  try {
    status.value = await window.codexGuard.updateConfig({
      host: form.host,
      port: Number(form.port),
      pollIntervalMs: Number(form.pollIntervalMs)
    })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    actionPending.value = false
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(timestamp)
}

onMounted(async () => {
  unsubscribeStatus = window.codexGuard.onStatusChanged(syncStatus)
  unsubscribeEvents = window.codexGuard.onMonitorEvent(addEvent)
  try {
    let initialStatus = await window.codexGuard.getMonitorStatus()
    Object.assign(form, initialStatus.config)
    if (!initialStatus.monitoring) {
      initialStatus = await window.codexGuard.startMonitor(initialStatus.config)
    }
    status.value = initialStatus
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  }
})

onBeforeUnmount(() => {
  unsubscribeStatus?.()
  unsubscribeEvents?.()
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-block">
        <div class="brand-icon" aria-hidden="true">
          <ShieldCheck :size="24" :stroke-width="2" />
        </div>
        <div>
          <h1>Codex CDP Guard</h1>
          <p>{{ status.config.host }}:{{ status.config.port }}</p>
        </div>
      </div>

      <div class="header-actions">
        <div class="status-badge" :class="connectionTone">
          <component
            :is="connectionIcon"
            :size="15"
            :class="{ spinning: status.connectionState === 'connecting' }"
          />
          <span>{{ connectionLabel }}</span>
        </div>
        <button
          v-if="!status.monitoring"
          class="button button-primary"
          type="button"
          :disabled="actionPending"
          @click="startMonitor"
        >
          <Play :size="16" fill="currentColor" />
          开始监控
        </button>
        <button
          v-else
          class="button button-danger"
          type="button"
          :disabled="actionPending"
          @click="stopMonitor"
        >
          <Square :size="15" fill="currentColor" />
          停止监控
        </button>
      </div>
    </header>

    <main class="main-content">
      <section class="status-strip" aria-label="监控统计">
        <div class="metric">
          <div class="metric-icon metric-green"><Activity :size="18" /></div>
          <div>
            <span>发现询问</span>
            <strong>{{ status.stats.detections }}</strong>
          </div>
        </div>
        <div class="metric">
          <div class="metric-icon metric-blue"><ShieldCheck :size="18" /></div>
          <div>
            <span>已暂停</span>
            <strong>{{ status.stats.snoozes }}</strong>
          </div>
        </div>
        <div class="metric">
          <div class="metric-icon metric-amber"><RefreshCw :size="18" /></div>
          <div>
            <span>连接失败</span>
            <strong>{{ status.stats.connectionFailures }}</strong>
          </div>
        </div>
        <div class="metric metric-wide">
          <div class="metric-icon" :class="status.monitoring ? 'metric-green' : 'metric-muted'">
            <CircleCheck v-if="status.monitoring" :size="18" />
            <CircleAlert v-else :size="18" />
          </div>
          <div>
            <span>监控状态</span>
            <strong class="metric-text">{{ status.monitoring ? '运行中' : '已停止' }}</strong>
          </div>
        </div>
      </section>

      <div v-if="status.errorMessage" class="notice notice-warning" role="status">
        <CircleAlert :size="18" />
        <span>{{ status.errorMessage }}</span>
      </div>

      <div class="content-grid">
        <section class="panel settings-panel">
          <div class="panel-heading">
            <div>
              <h2>连接设置</h2>
              <p>Codex 页面：{{ status.targetTitle ?? '尚未发现' }}</p>
            </div>
            <Plug :size="20" />
          </div>

          <form class="settings-form" @submit.prevent="applyConfig">
            <label class="field field-host">
              <span>主机地址</span>
              <input v-model.trim="form.host" type="text" autocomplete="off" />
            </label>
            <label class="field">
              <span>端口</span>
              <input v-model.number="form.port" type="number" min="1" max="65535" step="1" />
            </label>
            <label class="field">
              <span>轮询间隔</span>
              <div class="input-with-unit">
                <input
                  v-model.number="form.pollIntervalMs"
                  type="number"
                  min="100"
                  max="5000"
                  step="50"
                />
                <span>ms</span>
              </div>
            </label>

            <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>

            <button class="button button-secondary save-button" type="submit" :disabled="actionPending">
              <Save :size="16" />
              应用设置
            </button>
          </form>
        </section>

        <section class="panel events-panel">
          <div class="panel-heading">
            <div>
              <h2>最近事件</h2>
              <p>当前会话最多显示 50 条</p>
            </div>
            <Clock3 :size="20" />
          </div>

          <div v-if="events.length" class="event-list">
            <article v-for="event in events" :key="event.id" class="event-row">
              <span class="event-dot" :class="`event-${event.level}`" aria-hidden="true"></span>
              <div class="event-copy">
                <p>{{ event.message }}</p>
                <time :datetime="new Date(event.timestamp).toISOString()">
                  {{ formatTime(event.timestamp) }}
                </time>
              </div>
            </article>
          </div>
          <div v-else class="empty-state">
            <Activity :size="24" />
            <span>暂无事件</span>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
