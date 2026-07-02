/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_NAME, APP_VERSION, appVersionLabel, appWindowTitle } from './runtimeInfo'

const root = process.cwd()

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T
}

describe('runtime info', () => {
  it('uses package version as the single UI version source', () => {
    const packageJson = readJson<{ version: string }>('package.json')

    expect(APP_VERSION).toBe(packageJson.version)
    expect(appVersionLabel()).toBe(`V${packageJson.version}`)
    expect(appWindowTitle()).toBe(`${APP_NAME} V${packageJson.version}`)
  })

  it('keeps the desktop window title on the current version', () => {
    const packageJson = readJson<{ version: string }>('package.json')
    const tauriConfig = readJson<{
      app: { windows: Array<{ label?: string; title?: string }> }
    }>('src-tauri/tauri.conf.json')

    expect(tauriConfig.app.windows).toHaveLength(1)
    expect(tauriConfig.app.windows[0]?.label).toBe('main')
    expect(tauriConfig.app.windows[0]?.title).toBe(`${APP_NAME} V${packageJson.version}`)
    expect(tauriConfig.app.windows[0]?.title).not.toContain('V1.1 桌面离线版')
  })

  it('keeps settings and shell pages wired to runtime version helpers', () => {
    const settingsSource = readFileSync(resolve(root, 'src/pages/SystemSettingsPage.tsx'), 'utf8')
    const shellSource = readFileSync(resolve(root, 'src/components/AppShell.tsx'), 'utf8')

    expect(settingsSource).toContain('APP_VERSION')
    expect(shellSource).toContain('applyRuntimeWindowTitle')
    expect(shellSource).toContain('appVersionLabel')
    expect(settingsSource).not.toContain('V1.1 桌面离线版')
    expect(shellSource).not.toContain('V1.1 桌面离线版')
  })

  it('keeps the desktop release binary on the Windows GUI subsystem', () => {
    const mainSource = readFileSync(resolve(root, 'src-tauri/src/main.rs'), 'utf8')

    expect(mainSource).toContain('windows_subsystem = "windows"')
  })
})
