import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function resolveBasePath() {
  if (process.env.TAURI_ENV_PLATFORM || process.env.VITE_DESKTOP_BUILD === '1') {
    return './'
  }

  const explicitBase = process.env.VITE_BASE_PATH?.trim()

  if (explicitBase) {
    return explicitBase
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]

  if (!repositoryName || repositoryName.endsWith('.github.io')) {
    return '/'
  }

  return `/${repositoryName}/`
}

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  base: resolveBasePath(),
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
})
