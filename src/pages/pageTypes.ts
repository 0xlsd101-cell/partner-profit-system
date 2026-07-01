import type { AppData } from '../domain/types'
import type { PageKey } from '../components/AppShell'
import type { PartnerRepository } from '../storage/repository'

export interface PageProps {
  data: AppData
  repository: PartnerRepository
  reload: () => Promise<void>
  notify: (message: string) => void
  navigate: (page: PageKey) => void
}
