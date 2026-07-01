import type {
  AdjustmentRecord,
  AnnualDividendConfirmation,
  AppData,
  CapitalLot,
  CapitalTransaction,
  DividendPayment,
  Member,
  MonthlyAllocation,
  MonthlySettlement,
  OperationLog,
  ProfitCalculatorRecord,
  RecordId,
} from '../domain/types'
import type { DangerousReplaceOptions } from './dataSafety'
import type { ClearLocalDataOptions } from './dataClearSafety'

export interface PartnerRepository {
  getData(): Promise<AppData>
  saveMember(member: Member): Promise<void>
  setManager(memberId: RecordId): Promise<void>
  setMemberStatus(memberId: RecordId, status: Member['status']): Promise<void>
  saveCapitalTransaction(transaction: CapitalTransaction): Promise<void>
  saveCapitalLot(lot: CapitalLot): Promise<void>
  saveMonthlySettlementWithAllocations(
    settlement: MonthlySettlement,
    allocations: MonthlyAllocation[],
  ): Promise<void>
  saveDividendPayment(payment: DividendPayment): Promise<void>
  voidDividendPayment(paymentId: RecordId, reason: string): Promise<void>
  saveAdjustmentRecord(record: AdjustmentRecord): Promise<void>
  saveAnnualDividendConfirmation(record: AnnualDividendConfirmation): Promise<void>
  saveAnnualDividendConfirmations(records: AnnualDividendConfirmation[]): Promise<void>
  saveOperationLog(log: OperationLog): Promise<void>
  saveProfitCalculatorRecord(record: ProfitCalculatorRecord): Promise<void>
  importData(data: AppData, options?: { overwriteLocked?: boolean }): Promise<void>
  clearLocalData(options?: ClearLocalDataOptions): Promise<void>
  /** 仅限空库演示数据初始化，不得用于普通导入恢复。 */
  replaceAllData(data: AppData, options?: DangerousReplaceOptions): Promise<void>
}
