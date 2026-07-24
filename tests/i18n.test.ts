import { describe, expect, it } from 'vitest'
import {
  resolveLocale,
  translate,
  translateMonitorMessage
} from '../src/renderer/src/i18n'

describe('界面语言', () => {
  it('首次启动和无效存储值使用中文', () => {
    expect(resolveLocale(null)).toBe('zh-CN')
    expect(resolveLocale('fr-FR')).toBe('zh-CN')
    expect(resolveLocale('en-US')).toBe('en-US')
  })

  it('提供中英文界面文案', () => {
    expect(translate('zh-CN', 'action.start')).toBe('开始监控')
    expect(translate('en-US', 'action.start')).toBe('Start monitoring')
  })

  it('翻译结构化监控消息并插入参数', () => {
    const message = {
      key: 'config.updated' as const,
      params: { address: '127.0.0.1:9229' }
    }

    expect(translateMonitorMessage('zh-CN', message)).toBe('连接设置已更新为 127.0.0.1:9229')
    expect(translateMonitorMessage('en-US', message)).toBe(
      'Connection settings updated to 127.0.0.1:9229'
    )
  })

  it('未知系统异常保留原始详情', () => {
    const message = {
      key: 'error.raw' as const,
      params: { detail: 'ECONNRESET' }
    }

    expect(translateMonitorMessage('zh-CN', message)).toBe('ECONNRESET')
    expect(translateMonitorMessage('en-US', message)).toBe('ECONNRESET')
  })
})
