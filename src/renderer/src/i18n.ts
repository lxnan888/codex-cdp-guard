import type { MonitorMessage, MonitorMessageKey } from '../../shared/types'

export const LOCALE_STORAGE_KEY = 'codex-cdp-guard.locale'

export type Locale = 'zh-CN' | 'en-US'

export type UiMessageKey =
  | 'language.switcher'
  | 'language.toChinese'
  | 'language.toEnglish'
  | 'connection.idle'
  | 'connection.connecting'
  | 'connection.connected'
  | 'connection.disconnected'
  | 'action.start'
  | 'action.stop'
  | 'stats.label'
  | 'stats.detections'
  | 'stats.snoozes'
  | 'stats.connectionFailures'
  | 'stats.monitoring'
  | 'monitor.running'
  | 'monitor.inactive'
  | 'settings.title'
  | 'settings.target'
  | 'target.unknown'
  | 'settings.host'
  | 'settings.port'
  | 'settings.pollInterval'
  | 'settings.apply'
  | 'events.title'
  | 'events.limit'
  | 'events.empty'

export type TranslationKey = UiMessageKey | MonitorMessageKey

const translations: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': {
    'language.switcher': '界面语言',
    'language.toChinese': '切换至中文',
    'language.toEnglish': '切换至英文',
    'connection.idle': '未连接',
    'connection.connecting': '连接中',
    'connection.connected': '已连接',
    'connection.disconnected': '等待重连',
    'action.start': '开始监控',
    'action.stop': '停止监控',
    'stats.label': '监控统计',
    'stats.detections': '发现询问',
    'stats.snoozes': '已暂停',
    'stats.connectionFailures': '连接失败',
    'stats.monitoring': '监控状态',
    'monitor.running': '运行中',
    'monitor.inactive': '已停止',
    'settings.title': '连接设置',
    'settings.target': 'Codex 页面：{target}',
    'target.unknown': '尚未发现',
    'settings.host': '主机地址',
    'settings.port': '端口',
    'settings.pollInterval': '轮询间隔',
    'settings.apply': '应用设置',
    'events.title': '最近事件',
    'events.limit': '当前会话最多显示 50 条',
    'events.empty': '暂无事件',
    'config.host.invalid': '主机地址不能为空，也不能包含协议前缀',
    'config.port.invalid': '端口必须是 1 到 65535 之间的整数',
    'config.pollInterval.invalid': '轮询间隔必须是 100 到 5000 毫秒之间的整数',
    'monitor.started': '监控已启动，正在查找 Codex 页面',
    'monitor.stopped': '监控已停止',
    'config.updated': '连接设置已更新为 {address}',
    'target.notFound': '未发现 Codex 页面，请确认 Codex 已启动并开放 CDP 端口',
    'target.connected': '已连接 Codex 页面：{title}',
    'cdp.listFailed': 'CDP 页面列表请求失败：HTTP {status}',
    'cdp.disconnected': 'CDP 连接已断开',
    'cdp.commandFailed': 'CDP 命令执行失败',
    'cdp.commandFailedWithDetail': 'CDP 命令执行失败：{detail}',
    'cdp.socketNotConnected': 'CDP WebSocket 尚未连接',
    'cdp.commandTimeout': 'CDP 命令超时：{method}',
    'cdp.scriptFailed': 'Codex 页面内的检测脚本执行失败',
    'prompt.detected': '发现新的询问面板，已触发暂停交互',
    'cdp.closed': 'CDP 连接已关闭',
    'cdp.timeout': '连接 CDP 超时',
    'error.raw': '{detail}'
  },
  'en-US': {
    'language.switcher': 'Interface language',
    'language.toChinese': 'Switch to Chinese',
    'language.toEnglish': 'Switch to English',
    'connection.idle': 'Offline',
    'connection.connecting': 'Connecting',
    'connection.connected': 'Connected',
    'connection.disconnected': 'Reconnecting',
    'action.start': 'Start monitoring',
    'action.stop': 'Stop monitoring',
    'stats.label': 'Monitoring statistics',
    'stats.detections': 'Prompts found',
    'stats.snoozes': 'Paused',
    'stats.connectionFailures': 'Connection failures',
    'stats.monitoring': 'Monitor status',
    'monitor.running': 'Running',
    'monitor.inactive': 'Stopped',
    'settings.title': 'Connection settings',
    'settings.target': 'Codex page: {target}',
    'target.unknown': 'Not found',
    'settings.host': 'Host',
    'settings.port': 'Port',
    'settings.pollInterval': 'Polling interval',
    'settings.apply': 'Apply settings',
    'events.title': 'Recent events',
    'events.limit': 'Shows up to 50 events from this session',
    'events.empty': 'No events yet',
    'config.host.invalid': 'Host cannot be empty or include a protocol prefix',
    'config.port.invalid': 'Port must be an integer between 1 and 65535',
    'config.pollInterval.invalid': 'Polling interval must be an integer between 100 and 5000 ms',
    'monitor.started': 'Monitoring started. Looking for the Codex page',
    'monitor.stopped': 'Monitoring stopped',
    'config.updated': 'Connection settings updated to {address}',
    'target.notFound': 'Codex page not found. Make sure Codex is running with a CDP port open',
    'target.connected': 'Connected to Codex page: {title}',
    'cdp.listFailed': 'CDP page list request failed: HTTP {status}',
    'cdp.disconnected': 'CDP connection closed',
    'cdp.commandFailed': 'CDP command failed',
    'cdp.commandFailedWithDetail': 'CDP command failed: {detail}',
    'cdp.socketNotConnected': 'CDP WebSocket is not connected',
    'cdp.commandTimeout': 'CDP command timed out: {method}',
    'cdp.scriptFailed': 'The detection script failed inside the Codex page',
    'prompt.detected': 'New prompt detected and the pause interaction was triggered',
    'cdp.closed': 'CDP connection is closed',
    'cdp.timeout': 'CDP connection timed out',
    'error.raw': '{detail}'
  }
}

export function resolveLocale(value: unknown): Locale {
  return value === 'en-US' || value === 'zh-CN' ? value : 'zh-CN'
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params: Record<string, string | number> = {}
): string {
  return translations[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}

export function translateMonitorMessage(locale: Locale, message: MonitorMessage): string {
  return translate(locale, message.key, message.params)
}
