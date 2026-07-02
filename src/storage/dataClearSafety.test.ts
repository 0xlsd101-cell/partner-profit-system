import { describe, expect, it } from 'vitest'
import {
  assertCanClearLocalData,
  CLEAR_LOCAL_DATA_BACKUP_REMINDER,
  CLEAR_LOCAL_DATA_CONFIRM_HINT,
  CLEAR_LOCAL_DATA_CONFIRM_TEXT,
  CLEAR_LOCAL_DATA_RECOVERY_WARNING,
  CLEAR_LOCAL_DATA_SCOPE_DESCRIPTION,
  CLEAR_LOCAL_DATA_TITLE,
  hasClearableLocalData,
  totalClearableLocalDataCount,
  type ClearLocalDataCounts,
} from './dataClearSafety'

const emptyCounts: ClearLocalDataCounts = {
  members: 0,
  capitalLots: 0,
  capitalTransactions: 0,
  monthlySettlements: 0,
  monthlyAllocations: 0,
  dividendPayments: 0,
  adjustmentRecords: 0,
  annualDividendConfirmations: 0,
  operationLogs: 0,
  profitCalculatorRecords: 0,
}

describe('local data clear safety', () => {
  it('uses clear Chinese high-risk confirmation copy', () => {
    const copy = [
      CLEAR_LOCAL_DATA_TITLE,
      CLEAR_LOCAL_DATA_SCOPE_DESCRIPTION,
      CLEAR_LOCAL_DATA_RECOVERY_WARNING,
      CLEAR_LOCAL_DATA_BACKUP_REMINDER,
      CLEAR_LOCAL_DATA_CONFIRM_HINT,
      CLEAR_LOCAL_DATA_CONFIRM_TEXT,
    ].join('\n')

    expect(CLEAR_LOCAL_DATA_TITLE).toBe('危险操作：清除本地数据')
    expect(CLEAR_LOCAL_DATA_CONFIRM_TEXT).toBe('确认清除本地数据')
    expect(copy).toContain('请先导出完整备份文件')
    expect(copy).toContain('清除后无法从当前设备恢复')
    expect(copy).toContain('此操作将清除当前设备中的本地业务数据')
    expect(copy).toContain('如果确认清除，请输入：确认清除本地数据')
    expect(copy).not.toMatch(/[�]|娓|璇|褰|鎹|鈥/)
    expect(copy).not.toMatch(/IndexedDB|JSON|localStorage|database|clearAll|dataClearSafety/)
  })

  it('counts all local data tables before clearing', () => {
    const counts: ClearLocalDataCounts = {
      ...emptyCounts,
      members: 2,
      monthlySettlements: 3,
      operationLogs: 4,
    }

    expect(totalClearableLocalDataCount(counts)).toBe(9)
    expect(hasClearableLocalData(counts)).toBe(true)
  })

  it('rejects clear requests without explicit dangerous confirmation', () => {
    const counts = { ...emptyCounts, members: 1 }

    expect(() => assertCanClearLocalData(counts)).toThrow('请输入“确认清除本地数据”后再执行清除。')
    expect(() =>
      assertCanClearLocalData(counts, {
        confirmClearData: true,
        confirmationText: '清除本地数据',
      }),
    ).toThrow('请输入“确认清除本地数据”后再执行清除。')
  })

  it('accepts clear requests only with the required Chinese confirmation text', () => {
    const counts = { ...emptyCounts, members: 1 }

    expect(() =>
      assertCanClearLocalData(counts, {
        confirmClearData: true,
        confirmationText: CLEAR_LOCAL_DATA_CONFIRM_TEXT,
      }),
    ).not.toThrow()
  })

  it('rejects clear requests when there is no local data to clear', () => {
    expect(() =>
      assertCanClearLocalData(emptyCounts, {
        confirmClearData: true,
        confirmationText: CLEAR_LOCAL_DATA_CONFIRM_TEXT,
      }),
    ).toThrow('当前系统没有可清除的本地数据。')
  })
})
