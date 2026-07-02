import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDbRepository } from './indexedDbRepository'
import { createPartnerRepository, isTauriRuntime } from './repositoryFactory'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

function setTestWindow(value: { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown } | undefined) {
  if (!value) {
    Reflect.deleteProperty(globalThis, 'window')
    return
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  })
}

describe('repository factory', () => {
  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  })

  it('uses IndexedDB repository in web runtime', () => {
    setTestWindow({})

    expect(isTauriRuntime()).toBe(false)
    expect(createPartnerRepository()).toBeInstanceOf(IndexedDbRepository)
  })

  it('detects Tauri runtime without loading SQLite in web tests', () => {
    setTestWindow({ __TAURI_INTERNALS__: {} })

    expect(isTauriRuntime()).toBe(true)
    expect(createPartnerRepository()).not.toBeInstanceOf(IndexedDbRepository)
  })
})
