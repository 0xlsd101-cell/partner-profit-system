import type { AppData } from '../domain/types'

export interface CoreBusinessDataCounts {
  members: number
  capitalLots: number
  monthlySettlements: number
  monthlyAllocations: number
  dividendPayments: number
}

export interface DangerousReplaceOptions {
  confirmDangerousReplace?: boolean
}

export function coreBusinessDataCounts(data: AppData): CoreBusinessDataCounts {
  return {
    members: data.members.length,
    capitalLots: data.capitalLots.length,
    monthlySettlements: data.monthlySettlements.length,
    monthlyAllocations: data.monthlyAllocations.length,
    dividendPayments: data.dividendPayments.length,
  }
}

export function hasCoreBusinessData(counts: CoreBusinessDataCounts): boolean {
  return Object.values(counts).some((count) => count > 0)
}

export function assertCanUnsafeReplaceAllDataForDemoOnly(
  counts: CoreBusinessDataCounts,
  options: DangerousReplaceOptions = {},
): void {
  if (!options.confirmDangerousReplace) {
    throw new Error('全量替换属于高风险操作，必须显式确认后才能执行。')
  }

  if (hasCoreBusinessData(counts)) {
    throw new Error('检测到当前系统已有数据，已阻止全量替换操作。')
  }
}
