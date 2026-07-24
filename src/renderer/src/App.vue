<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Clock3,
  Languages,
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
  type MonitorMessage,
  type MonitorStatus
} from '../../shared/types'
import {
  LOCALE_STORAGE_KEY,
  resolveLocale,
  translate,
  translateMonitorMessage,
  type Locale,
  type TranslationKey
} from './i18n'

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
const formError = ref<MonitorMessage | null>(null)
const locale = ref<Locale>(resolveLocale(localStorage.getItem(LOCALE_STORAGE_KEY)))
let unsubscribeStatus: (() => void) | undefined
let unsubscribeEvents: (() => void) | undefined

document.documentElement.lang = locale.value

function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(locale.value, key, params)
}

function messageText(message: MonitorMessage): string {
  return translateMonitorMessage(locale.value, message)
}

function rawMessage(error: unknown): MonitorMessage {
  return {
    key: 'error.raw',
    params: { detail: error instanceof Error ? error.message : String(error) }
  }
}

function setLocale(nextLocale: Locale): void {
  locale.value = nextLocale
  localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
  document.documentElement.lang = nextLocale
}

const connectionLabel = computed(() => {
  const labels: Record<MonitorStatus['connectionState'], TranslationKey> = {
    idle: 'connection.idle',
    connecting: 'connection.connecting',
    connected: 'connection.connected',
    disconnected: 'connection.disconnected'
  }
  return t(labels[status.value.connectionState])
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
  formError.value = null
  try {
    const result = await window.codexGuard.startMonitor({ ...form })
    if (result.ok) {
      status.value = result.status
    } else {
      formError.value = result.error
    }
  } catch (error) {
    formError.value = rawMessage(error)
  } finally {
    actionPending.value = false
  }
}

async function stopMonitor(): Promise<void> {
  actionPending.value = true
  formError.value = null
  try {
    status.value = await window.codexGuard.stopMonitor()
  } catch (error) {
    formError.value = rawMessage(error)
  } finally {
    actionPending.value = false
  }
}

async function applyConfig(): Promise<void> {
  actionPending.value = true
  formError.value = null
  try {
    const result = await window.codexGuard.updateConfig({
      host: form.host,
      port: Number(form.port),
      pollIntervalMs: Number(form.pollIntervalMs)
    })
    if (result.ok) {
      status.value = result.status
    } else {
      formError.value = result.error
    }
  } catch (error) {
    formError.value = rawMessage(error)
  } finally {
    actionPending.value = false
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(locale.value, {
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
    status.value = initialStatus
    if (!initialStatus.monitoring) {
      const result = await window.codexGuard.startMonitor(initialStatus.config)
      if (result.ok) {
        initialStatus = result.status
        status.value = result.status
      } else {
        formError.value = result.error
      }
    }
  } catch (error) {
    formError.value = rawMessage(error)
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
        <div class="language-switcher" role="group" :aria-label="t('language.switcher')">
          <Languages class="language-icon" :size="14" aria-hidden="true" />
          <button
            class="language-option"
            :class="{ active: locale === 'zh-CN' }"
            type="button"
            :aria-pressed="locale === 'zh-CN'"
            :title="t('language.toChinese')"
            @click="setLocale('zh-CN')"
          >
            中文
          </button>
          <button
            class="language-option"
            :class="{ active: locale === 'en-US' }"
            type="button"
            :aria-pressed="locale === 'en-US'"
            :title="t('language.toEnglish')"
            @click="setLocale('en-US')"
          >
            EN
          </button>
        </div>
        <button
          v-if="!status.monitoring"
          class="button button-primary monitor-button"
          type="button"
          :disabled="actionPending"
          @click="startMonitor"
        >
          <Play :size="16" fill="currentColor" />
          {{ t('action.start') }}
        </button>
        <button
          v-else
          class="button button-danger monitor-button"
          type="button"
          :disabled="actionPending"
          @click="stopMonitor"
        >
          <Square :size="15" fill="currentColor" />
          {{ t('action.stop') }}
        </button>
      </div>
    </header>

    <main class="main-content">
      <section class="status-strip" :aria-label="t('stats.label')">
        <div class="metric">
          <div class="metric-icon metric-green"><Activity :size="18" /></div>
          <div>
            <span>{{ t('stats.detections') }}</span>
            <strong>{{ status.stats.detections }}</strong>
          </div>
        </div>
        <div class="metric">
          <div class="metric-icon metric-blue"><ShieldCheck :size="18" /></div>
          <div>
            <span>{{ t('stats.snoozes') }}</span>
            <strong>{{ status.stats.snoozes }}</strong>
          </div>
        </div>
        <div class="metric">
          <div class="metric-icon metric-amber"><RefreshCw :size="18" /></div>
          <div>
            <span>{{ t('stats.connectionFailures') }}</span>
            <strong>{{ status.stats.connectionFailures }}</strong>
          </div>
        </div>
        <div class="metric metric-wide">
          <div class="metric-icon" :class="status.monitoring ? 'metric-green' : 'metric-muted'">
            <CircleCheck v-if="status.monitoring" :size="18" />
            <CircleAlert v-else :size="18" />
          </div>
          <div>
            <span>{{ t('stats.monitoring') }}</span>
            <strong class="metric-text">
              {{ status.monitoring ? t('monitor.running') : t('monitor.inactive') }}
            </strong>
          </div>
        </div>
      </section>

      <div v-if="status.errorMessage" class="notice notice-warning" role="status">
        <CircleAlert :size="18" />
        <span>{{ messageText(status.errorMessage) }}</span>
      </div>

      <div class="content-grid">
        <section class="panel settings-panel">
          <div class="panel-heading">
            <div>
              <h2>{{ t('settings.title') }}</h2>
              <p>
                {{
                  t('settings.target', {
                    target: status.targetTitle ?? t('target.unknown')
                  })
                }}
              </p>
            </div>
            <Plug :size="20" />
          </div>

          <form class="settings-form" @submit.prevent="applyConfig">
            <label class="field field-host">
              <span>{{ t('settings.host') }}</span>
              <input v-model.trim="form.host" type="text" autocomplete="off" />
            </label>
            <label class="field">
              <span>{{ t('settings.port') }}</span>
              <input v-model.number="form.port" type="number" min="1" max="65535" step="1" />
            </label>
            <label class="field">
              <span>{{ t('settings.pollInterval') }}</span>
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

            <div v-if="formError" class="form-error" role="alert">
              {{ messageText(formError) }}
            </div>

            <button class="button button-secondary save-button" type="submit" :disabled="actionPending">
              <Save :size="16" />
              {{ t('settings.apply') }}
            </button>
          </form>
        </section>

        <section class="panel events-panel">
          <div class="panel-heading">
            <div>
              <h2>{{ t('events.title') }}</h2>
              <p>{{ t('events.limit') }}</p>
            </div>
            <Clock3 :size="20" />
          </div>

          <div v-if="events.length" class="event-list">
            <article v-for="event in events" :key="event.id" class="event-row">
              <span class="event-dot" :class="`event-${event.level}`" aria-hidden="true"></span>
              <div class="event-copy">
                <p>{{ messageText(event.message) }}</p>
                <time :datetime="new Date(event.timestamp).toISOString()">
                  {{ formatTime(event.timestamp) }}
                </time>
              </div>
            </article>
          </div>
          <div v-else class="empty-state">
            <Activity :size="24" />
            <span>{{ t('events.empty') }}</span>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
