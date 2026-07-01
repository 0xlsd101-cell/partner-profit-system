import { Calculator } from 'lucide-react'
import { useState } from 'react'
import type { Member } from '../domain/types'
import type { PartnerRepository } from '../storage/repository'
import { Button } from './common'
import { ProfitCalculatorModal } from './ProfitCalculatorModal'

interface ProfitCalculatorButtonProps {
  members: Member[]
  repository: Pick<PartnerRepository, 'saveProfitCalculatorRecord'>
  reload: () => Promise<void>
  notify: (message: string) => void
}

export function ProfitCalculatorButton({
  members,
  repository,
  reload,
  notify,
}: ProfitCalculatorButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Calculator size={16} />
        收益计算器
      </Button>
      <ProfitCalculatorModal
        open={open}
        members={members}
        repository={repository}
        reload={reload}
        notify={notify}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
