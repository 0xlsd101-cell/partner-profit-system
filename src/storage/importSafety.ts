import { isFinalizedSettlementStatus, normalizeMonthlySettlement } from '../domain/calculation'
import type { MonthlyAllocation, MonthlySettlement } from '../domain/types'

export interface ImportAllocationProtectionSummary {
  importableAllocationCount: number
  protectedSkippedAllocationCount: number
  abnormalAllocationCount: number
  protectedMonths: string[]
}

export interface ImportAllocationProtectionResult {
  importableAllocations: MonthlyAllocation[]
  protectedAllocations: MonthlyAllocation[]
  abnormalAllocations: MonthlyAllocation[]
  summary: ImportAllocationProtectionSummary
}

interface ImportAllocationProtectionInput {
  currentSettlements: MonthlySettlement[]
  currentAllocations: MonthlyAllocation[]
  importedSettlements: MonthlySettlement[]
  importedAllocations: MonthlyAllocation[]
}

function finalizedSettlementMaps(settlements: MonthlySettlement[]) {
  const byId = new Map<string, MonthlySettlement>()
  const finalizedIds = new Set<string>()
  const finalizedMonths = new Set<string>()

  for (const settlement of settlements.map(normalizeMonthlySettlement)) {
    byId.set(settlement.id, settlement)

    if (isFinalizedSettlementStatus(settlement.status)) {
      finalizedIds.add(settlement.id)
      finalizedMonths.add(settlement.month)
    }
  }

  return { byId, finalizedIds, finalizedMonths }
}

export function validateImportAllocationsAgainstLockedSettlements({
  currentSettlements,
  currentAllocations,
  importedSettlements,
  importedAllocations,
}: ImportAllocationProtectionInput): ImportAllocationProtectionResult {
  const current = finalizedSettlementMaps(currentSettlements)
  const importedSettlementsById = new Map(
    importedSettlements.map((settlement) => [settlement.id, normalizeMonthlySettlement(settlement)]),
  )
  const currentAllocationsById = new Map(currentAllocations.map((allocation) => [allocation.id, allocation]))
  const importableAllocations: MonthlyAllocation[] = []
  const protectedAllocations: MonthlyAllocation[] = []
  const abnormalAllocations: MonthlyAllocation[] = []
  const protectedMonths = new Set<string>()

  for (const allocation of importedAllocations) {
    const existingAllocation = currentAllocationsById.get(allocation.id)
    const existingSettlement = existingAllocation
      ? current.byId.get(existingAllocation.settlementId)
      : undefined
    const matchedSettlement =
      current.byId.get(allocation.settlementId) ?? importedSettlementsById.get(allocation.settlementId)

    let protectedMonth = ''

    if (current.finalizedIds.has(allocation.settlementId)) {
      protectedMonth = current.byId.get(allocation.settlementId)?.month ?? allocation.month
    } else if (current.finalizedMonths.has(allocation.month)) {
      protectedMonth = allocation.month
    } else if (
      existingSettlement &&
      isFinalizedSettlementStatus(normalizeMonthlySettlement(existingSettlement).status)
    ) {
      protectedMonth = existingSettlement.month
    } else if (existingAllocation && current.finalizedMonths.has(existingAllocation.month)) {
      protectedMonth = existingAllocation.month
    }

    if (protectedMonth) {
      protectedAllocations.push(allocation)
      protectedMonths.add(protectedMonth)
      continue
    }

    if (!allocation.settlementId || !allocation.month || !matchedSettlement) {
      abnormalAllocations.push(allocation)
      continue
    }

    if (matchedSettlement.month !== allocation.month) {
      abnormalAllocations.push(allocation)
      continue
    }

    importableAllocations.push(allocation)
  }

  return {
    importableAllocations,
    protectedAllocations,
    abnormalAllocations,
    summary: {
      importableAllocationCount: importableAllocations.length,
      protectedSkippedAllocationCount: protectedAllocations.length,
      abnormalAllocationCount: abnormalAllocations.length,
      protectedMonths: Array.from(protectedMonths).sort(),
    },
  }
}
