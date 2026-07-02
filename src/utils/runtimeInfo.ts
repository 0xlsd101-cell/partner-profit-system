declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
}

const SQLITE_FILE_NAME = 'partner-profit-system.sqlite'

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__))
  )
}

export function runtimeModeLabel(): string {
  return isTauriRuntime() ? '桌面离线版' : '网页版'
}

export function storageModeLabel(): string {
  return isTauriRuntime() ? '本地 SQLite' : '浏览器本地数据'
}

export async function desktopSqlitePathLabel(): Promise<string> {
  if (!isTauriRuntime()) {
    return '网页版不使用 SQLite 数据库'
  }

  try {
    const { appDataDir } = await import('@tauri-apps/api/path')
    const appDataPath = await appDataDir()
    const separator = appDataPath.endsWith('\\') || appDataPath.endsWith('/') ? '' : '\\'

    return `${appDataPath}${separator}${SQLITE_FILE_NAME}`
  } catch {
    return `%APPDATA%\\com.partnerprofit.system\\${SQLITE_FILE_NAME}`
  }
}
