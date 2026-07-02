export const CLEAR_LOCAL_DATA_CONFIRM_TEXT = '确认清除本地数据'
export const CLEAR_LOCAL_DATA_TITLE = '危险操作：清除本地数据'
export const CLEAR_LOCAL_DATA_SCOPE_DESCRIPTION =
  '此操作将清除当前设备中的本地业务数据，包括合伙人、资金批次、月度结算、收益明细、分红支付、操作日志等记录。'
export const CLEAR_LOCAL_DATA_RECOVERY_WARNING = '此操作不会自动生成备份，清除后无法从当前设备恢复。'
export const CLEAR_LOCAL_DATA_BACKUP_REMINDER = '请先导出完整备份文件，再继续操作。'
export const CLEAR_LOCAL_DATA_CONFIRM_HINT = `如果确认清除，请输入：${CLEAR_LOCAL_DATA_CONFIRM_TEXT}`

export interface ClearLocalDataCounts {
  members: number
  capitalLots: number
  capitalTransactions: number
  monthlySettlements: number
  monthlyAllocations: number
  dividendPayments: number
  adjustmentRecords: number
  annualDividendConfirmations: number
  operationLogs: number
  profitCalculatorRecords: number
}

export interface ClearLocalDataOptions {
  confirmClearData?: boolean
  confirmationText?: string
  reason?: string
}

export function totalClearableLocalDataCount(counts: ClearLocalDataCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

export function hasClearableLocalData(counts: ClearLocalDataCounts): boolean {
  return totalClearableLocalDataCount(counts) > 0
}

export function assertCanClearLocalData(
  counts: ClearLocalDataCounts,
  options: ClearLocalDataOptions = {},
): void {
  if (!options.confirmClearData || options.confirmationText?.trim() !== CLEAR_LOCAL_DATA_CONFIRM_TEXT) {
    throw new Error(`请输入“${CLEAR_LOCAL_DATA_CONFIRM_TEXT}”后再执行清除。`)
  }

  if (!hasClearableLocalData(counts)) {
    throw new Error('当前系统没有可清除的本地数据。')
  }
}
