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
import { IndexedDbRepository } from './indexedDbRepository'
import type { ClearLocalDataOptions } from './dataClearSafety'
import type { DangerousReplaceOptions } from './dataSafety'
import type { PartnerRepository } from './repository'
import { isTauriRuntime } from '../utils/runtimeInfo'

export { isTauriRuntime }

class LazySqliteRepository implements PartnerRepository {
  private repositoryPromise: Promise<PartnerRepository> | undefined

  private async getRepository(): Promise<PartnerRepository> {
    this.repositoryPromise ??= import('./sqliteRepository').then(
      ({ SqliteRepository }) => new SqliteRepository(),
    )
    return this.repositoryPromise
  }

  async getData(): Promise<AppData> {
    return (await this.getRepository()).getData()
  }

  async saveMember(member: Member): Promise<void> {
    return (await this.getRepository()).saveMember(member)
  }

  async setManager(memberId: RecordId): Promise<void> {
    return (await this.getRepository()).setManager(memberId)
  }

  async setMemberStatus(memberId: RecordId, status: Member['status']): Promise<void> {
    return (await this.getRepository()).setMemberStatus(memberId, status)
  }

  async saveCapitalTransaction(transaction: CapitalTransaction): Promise<void> {
    return (await this.getRepository()).saveCapitalTransaction(transaction)
  }

  async saveCapitalLot(lot: CapitalLot): Promise<void> {
    return (await this.getRepository()).saveCapitalLot(lot)
  }

  async saveMonthlySettlementWithAllocations(
    settlement: MonthlySettlement,
    allocations: MonthlyAllocation[],
  ): Promise<void> {
    return (await this.getRepository()).saveMonthlySettlementWithAllocations(settlement, allocations)
  }

  async saveDividendPayment(payment: DividendPayment): Promise<void> {
    return (await this.getRepository()).saveDividendPayment(payment)
  }

  async voidDividendPayment(paymentId: RecordId, reason: string): Promise<void> {
    return (await this.getRepository()).voidDividendPayment(paymentId, reason)
  }

  async saveAdjustmentRecord(record: AdjustmentRecord): Promise<void> {
    return (await this.getRepository()).saveAdjustmentRecord(record)
  }

  async saveAnnualDividendConfirmation(record: AnnualDividendConfirmation): Promise<void> {
    return (await this.getRepository()).saveAnnualDividendConfirmation(record)
  }

  async saveAnnualDividendConfirmations(records: AnnualDividendConfirmation[]): Promise<void> {
    return (await this.getRepository()).saveAnnualDividendConfirmations(records)
  }

  async saveOperationLog(log: OperationLog): Promise<void> {
    return (await this.getRepository()).saveOperationLog(log)
  }

  async saveProfitCalculatorRecord(record: ProfitCalculatorRecord): Promise<void> {
    return (await this.getRepository()).saveProfitCalculatorRecord(record)
  }

  async importData(data: AppData, options?: { overwriteLocked?: boolean }): Promise<void> {
    return (await this.getRepository()).importData(data, options)
  }

  async clearLocalData(options?: ClearLocalDataOptions): Promise<void> {
    return (await this.getRepository()).clearLocalData(options)
  }

  async replaceAllData(data: AppData, options?: DangerousReplaceOptions): Promise<void> {
    return (await this.getRepository()).replaceAllData(data, options)
  }
}

export function createPartnerRepository(): PartnerRepository {
  return isTauriRuntime() ? new LazySqliteRepository() : new IndexedDbRepository()
}
