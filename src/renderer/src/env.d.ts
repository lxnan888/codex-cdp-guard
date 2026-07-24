/// <reference types="vite/client" />

import type { CodexGuardApi } from '../../shared/types'

declare global {
  interface Window {
    codexGuard: CodexGuardApi
  }
}

export {}
