import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function resolveBasePath() {
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
  base: resolveBasePath(),
  plugins: [react()],
})
