import Dexie, { type Table } from 'dexie'
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
import type { PartnerRepository } from './repository'
import {
  capitalLotFromTransaction,
  isFinalizedSettlementStatus,
  normalizeCapitalTransaction,
  normalizeDividendPayment,
  normalizeMonthlySettlement,
} from '../domain/calculation'
import { normalizeProfitCalculatorRecord } from '../domain/profitCalculator'
import { createId, nowIso } from '../utils/date'
import {
  assertCanUnsafeReplaceAllDataForDemoOnly,
  type CoreBusinessDataCounts,
  type DangerousReplaceOptions,
} from './dataSafety'
import {
  assertCanClearLocalData,
  type ClearLocalDataCounts,
  type ClearLocalDataOptions,
} from './dataClearSafety'
import { validateImportAllocationsAgainstLockedSettlements } from './importSafety'

class PartnerDividendDb extends Dexie {
  members!: Table<Member, string>
  capitalLots!: Table<CapitalLot, string>
  capitalTransactions!: Table<CapitalTransaction, string>
  monthlySettlements!: Table<MonthlySettlement, string>
  monthlyAllocations!: Table<MonthlyAllocation, string>
  dividendPayments!: Table<DividendPayment, string>
  adjustmentRecords!: Table<AdjustmentRecord, string>
  annualDividendConfirmations!: Table<AnnualDividendConfirmation, string>
  operationLogs!: Table<OperationLog, string>
  profitCalculatorRecords!: Table<ProfitCalculatorRecord, string>

  constructor() {
    super('partnerDividendMvp')

    this.version(1).stores({
      members: '&id, role, status, name',
      capitalTransactions: '&id, memberId, effectiveMonth, transactionDate, [memberId+effectiveMonth]',
      monthlySettlements: '&id, &month, status',
      monthlyAllocations: '&id, settlementId, month, memberId, [settlementId+memberId]',
      dividendPayments: '&id, year, memberId, paidAt, [year+memberId]',
    })

    this.version(2).stores({
      members: '&id, role, status, name',
      capitalTransactions: '&id, memberId, effectiveMonth, transactionDate, [memberId+effectiveMonth]',
      monthlySettlements: '&id, &month, status',
      monthlyAllocations: '&id, settlementId, month, memberId, [settlementId+memberId]',
      dividendPayments: '&id, year, memberId, paidAt, [year+memberId]',
      profitCalculatorRecords: '&id, recordType, memberId, createdAt',
    })

    this.version(3).stores({
      members: '&id, role, status, name',
      capitalLots: '&id, memberId, startDate, status, [memberId+startDate]',
      capitalTransactions: '&id, memberId, effectiveMonth, transactionDate, [memberId+effectiveMonth]',
      monthlySettlements: '&id, &month, status',
      monthlyAllocations: '&id, settlementId, month, memberId, capitalLotId, [settlementId+memberId]',
      dividendPayments: '&id, year, memberId, paidAt, [year+memberId]',
      adjustmentRecords: '&id, targetMonth, adjustmentMonth, memberId, type',
      profitCalculatorRecords: '&id, recordType, memberId, createdAt',
    })

    this.version(4).stores({
      members: '&id, role, status, name',
      capitalLots: '&id, memberId, startDate, status, [memberId+startDate]',
      capitalTransactions: '&id, memberId, effectiveMonth, transactionDate, [memberId+effectiveMonth]',
      monthlySettlements: '&id, &month, status',
      monthlyAllocations: '&id, settlementId, month, memberId, capitalLotId, [settlementId+memberId]',
      dividendPayments: '&id, year, memberId, paymentDate, status, [year+memberId]',
      adjustmentRecords: '&id, targetMonth, adjustmentMonth, memberId, type',
      annualDividendConfirmations: '&id, year, memberId, status, [year+memberId]',
      operationLogs: '&id, action, entityType, entityId, createdAt',
      profitCalculatorRecords: '&id, recordType, memberId, createdAt',
    })

    this.version(5).stores({
      members: '&id, role, status, name',
      capitalLots: '&id, memberId, startDate, status, [memberId+startDate]',
      capitalTransactions: '&id, memberId, effectiveMonth, transactionDate, [memberId+effectiveMonth]',
      monthlySettlements: '&id, &month, status',
      monthlyAllocations: '&id, settlementId, month, memberId, capitalLotId, [settlementId+memberId]',
      dividendPayments: '&id, year, memberId, paymentDate, status, [year+memberId]',
      adjustmentRecords: '&id, targetMonth, adjustmentMonth, memberId, type',
      annualDividendConfirmations: '&id, year, memberId, status, [year+memberId]',
      operationLogs: '&id, action, entityType, entityId, createdAt',
      profitCalculatorRecords: '&id, recordType, memberId, createdAt',
    }).upgrade((transaction) =>
      transaction
        .table('monthlySettlements')
        .toCollection()
        .modify((settlement) => Object.assign(settlement, normalizeMonthlySettlement(settlement))),
    )
  }
}

function byCreatedAt<T extends { createdAt: string }>(a: T, b: T): number {
  return a.createdAt.localeCompare(b.createdAt)
}

function byMonth<T extends { month: string }>(a: T, b: T): number {
  return a.month.localeCompare(b.month)
}

function stamp<T extends { createdAt: string; updatedAt: string }>(record: T): T {
  const now = nowIso()

  return {
    ...record,
    createdAt: record.createdAt || now,
    updatedAt: now,
  }
}

function snapshot(value: unknown): string {
  return JSON.stringify(value)
}

export class IndexedDbRepository implements PartnerRepository {
  private db = new PartnerDividendDb()

  private async logOperation(input: Omit<OperationLog, 'id' | 'createdAt'>): Promise<void> {
    await this.db.operationLogs.put({
      id: createId('op_log'),
      createdAt: nowIso(),
      ...input,
    })
  }

  async getData(): Promise<AppData> {
    const [
      members,
      capitalLots,
      capitalTransactions,
      monthlySettlements,
      monthlyAllocations,
      dividendPayments,
      adjustmentRecords,
      annualDividendConfirmations,
      operationLogs,
      profitCalculatorRecords,
    ] = await Promise.all([
      this.db.members.toArray(),
      this.db.capitalLots.toArray(),
      this.db.capitalTransactions.toArray(),
      this.db.monthlySettlements.toArray(),
      this.db.monthlyAllocations.toArray(),
      this.db.dividendPayments.toArray(),
      this.db.adjustmentRecords.toArray(),
      this.db.annualDividendConfirmations.toArray(),
      this.db.operationLogs.toArray(),
      this.db.profitCalculatorRecords.toArray(),
    ])

    const normalizedTransactions = capitalTransactions.map(normalizeCapitalTransaction)
    const lotIds = new Set(capitalLots.map((lot) => lot.id))
    const derivedMissingLots = normalizedTransactions.flatMap((transaction) => {
      const lot = capitalLotFromTransaction(transaction)
      return lot && !lotIds.has(lot.id) ? [lot] : []
    })
    const mergedCapitalLots = [...capitalLots, ...derivedMissingLots]

    return {
      members: members.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      capitalLots: mergedCapitalLots.sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || byCreatedAt(a, b),
      ),
      capitalTransactions: normalizedTransactions.sort(
        (a, b) =>
          b.effectiveMonth.localeCompare(a.effectiveMonth) ||
          b.transactionDate.localeCompare(a.transactionDate) ||
          byCreatedAt(b, a),
      ),
      monthlySettlements: monthlySettlements.map(normalizeMonthlySettlement).sort(byMonth),
      monthlyAllocations: monthlyAllocations.sort(
        (a, b) => a.month.localeCompare(b.month) || a.memberName.localeCompare(b.memberName, 'zh-CN'),
      ),
      dividendPayments: dividendPayments.map(normalizeDividendPayment).sort(
        (a, b) =>
          normalizeDividendPayment(b).paymentDate.localeCompare(normalizeDividendPayment(a).paymentDate) ||
          byCreatedAt(b, a),
      ),
      adjustmentRecords: adjustmentRecords.sort(
        (a, b) =>
          b.adjustmentMonth.localeCompare(a.adjustmentMonth) ||
          b.targetMonth.localeCompare(a.targetMonth) ||
          byCreatedAt(b, a),
      ),
      annualDividendConfirmations: annualDividendConfirmations.sort(
        (a, b) => b.year - a.year || a.memberId.localeCompare(b.memberId),
      ),
      operationLogs: operationLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      profitCalculatorRecords: profitCalculatorRecords
        .map(normalizeProfitCalculatorRecord)
        .sort((a, b) => byCreatedAt(b, a)),
    }
  }

  async saveMember(member: Member): Promise<void> {
    await this.db.transaction('rw', this.db.members, this.db.operationLogs, async () => {
      const before = await this.db.members.get(member.id)
      const saved = stamp(member)
      await this.db.members.put(saved)
      await this.logOperation({
        action: before ? 'member_update' : 'member_create',
        entityType: 'member',
        entityId: saved.id,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: snapshot(saved),
      })
    })
  }

  async setManager(memberId: RecordId): Promise<void> {
    const now = nowIso()

    await this.db.transaction('rw', this.db.members, this.db.operationLogs, async () => {
      const members = await this.db.members.toArray()
      const before = members.find((member) => member.id === memberId)

      await Promise.all(
        members.map((member) =>
          this.db.members.update(member.id, {
            role: member.id === memberId ? 'manager' : 'partner',
            updatedAt: now,
          }),
        ),
      )
      const after = await this.db.members.get(memberId)
      await this.logOperation({
        action: 'member_set_manager',
        entityType: 'member',
        entityId: memberId,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: after ? snapshot(after) : undefined,
      })
    })
  }

  async setMemberStatus(memberId: RecordId, status: Member['status']): Promise<void> {
    await this.db.transaction('rw', this.db.members, this.db.operationLogs, async () => {
      const before = await this.db.members.get(memberId)
      await this.db.members.update(memberId, {
        status,
        updatedAt: nowIso(),
      })
      const after = await this.db.members.get(memberId)
      await this.logOperation({
        action: 'member_status_update',
        entityType: 'member',
        entityId: memberId,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: after ? snapshot(after) : undefined,
      })
    })
  }

  async saveCapitalTransaction(transaction: CapitalTransaction): Promise<void> {
    const savedTransaction = stamp(normalizeCapitalTransaction(transaction))
    const lot = capitalLotFromTransaction(savedTransaction)

    await this.db.transaction(
      'rw',
      this.db.capitalTransactions,
      this.db.capitalLots,
      this.db.operationLogs,
      async () => {
      const before = await this.db.capitalTransactions.get(savedTransaction.id)
      await this.db.capitalTransactions.put(savedTransaction)
      await this.logOperation({
        action: before ? 'capital_transaction_update' : 'capital_transaction_create',
        entityType: 'capitalTransaction',
        entityId: savedTransaction.id,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: snapshot(savedTransaction),
      })

      if (lot) {
        const beforeLot = await this.db.capitalLots.get(lot.id)
        await this.db.capitalLots.put(stamp(lot))
        await this.logOperation({
          action: beforeLot ? 'capital_lot_update' : 'capital_lot_create',
          entityType: 'capitalLot',
          entityId: lot.id,
          beforeSnapshot: beforeLot ? snapshot(beforeLot) : undefined,
          afterSnapshot: snapshot(lot),
        })
      }
      },
    )
  }

  async saveCapitalLot(lot: CapitalLot): Promise<void> {
    await this.db.transaction('rw', this.db.capitalLots, this.db.operationLogs, async () => {
      const before = await this.db.capitalLots.get(lot.id)
      const saved = stamp(lot)
      await this.db.capitalLots.put(saved)
      await this.logOperation({
        action: before ? 'capital_lot_update' : 'capital_lot_create',
        entityType: 'capitalLot',
        entityId: saved.id,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: snapshot(saved),
      })
    })
  }

  async saveMonthlySettlementWithAllocations(
    settlement: MonthlySettlement,
    allocations: MonthlyAllocation[],
  ): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.monthlySettlements,
      this.db.monthlyAllocations,
      this.db.operationLogs,
      async () => {
        const existing = await this.db.monthlySettlements
          .where('month')
          .equals(settlement.month)
          .first()

        if (existing && isFinalizedSettlementStatus(existing.status)) {
          throw new Error('已锁定或已调整月份不能直接修改，请新增调整记录。')
        }

        if (existing && existing.id !== settlement.id) {
          await this.db.monthlyAllocations
            .where('settlementId')
            .equals(existing.id)
            .delete()
          await this.db.monthlySettlements.delete(existing.id)
        }

        const savedSettlement = stamp({
          ...normalizeMonthlySettlement(settlement),
          createdAt: existing?.createdAt ?? settlement.createdAt,
        })
        const savedAllocations = allocations.map((allocation) =>
          stamp({
            ...allocation,
            createdAt: allocation.createdAt || existing?.createdAt || settlement.createdAt,
          }),
        )

        await this.db.monthlySettlements.put(savedSettlement)
        await this.db.monthlyAllocations
          .where('settlementId')
          .equals(savedSettlement.id)
          .delete()

        if (savedAllocations.length > 0) {
          await this.db.monthlyAllocations.bulkPut(savedAllocations)
        }
        await this.logOperation({
          action: savedSettlement.status === 'locked' ? 'monthly_settlement_locked' : 'monthly_settlement_save',
          entityType: 'monthlySettlement',
          entityId: savedSettlement.id,
          beforeSnapshot: existing ? snapshot(existing) : undefined,
          afterSnapshot: snapshot(savedSettlement),
        })

        if (savedSettlement.actualDistributableNetIncome || savedSettlement.actualDistributableIncome) {
          await this.logOperation({
            action: 'actual_net_income_save',
            entityType: 'monthlySettlement',
            entityId: savedSettlement.id,
            beforeSnapshot: existing ? snapshot(existing) : undefined,
            afterSnapshot: snapshot(savedSettlement),
          })
        }
      },
    )
  }

  async saveDividendPayment(payment: DividendPayment): Promise<void> {
    await this.db.transaction('rw', this.db.dividendPayments, this.db.operationLogs, async () => {
      const before = await this.db.dividendPayments.get(payment.id)
      const saved = stamp(normalizeDividendPayment(payment))
      await this.db.dividendPayments.put(saved)
      await this.logOperation({
        action: before ? 'dividend_payment_update' : 'dividend_payment_create',
        entityType: 'dividendPayment',
        entityId: saved.id,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: snapshot(saved),
      })
    })
  }

  async voidDividendPayment(paymentId: RecordId, reason: string): Promise<void> {
    await this.db.transaction('rw', this.db.dividendPayments, this.db.operationLogs, async () => {
      const before = await this.db.dividendPayments.get(paymentId)

      if (!before) {
        throw new Error('未找到支付记录。')
      }

      const after = {
        ...normalizeDividendPayment(before),
        status: 'void' as const,
        voidedAt: nowIso(),
        voidReason: reason.trim(),
        updatedAt: nowIso(),
      }
      await this.db.dividendPayments.put(after)
      await this.logOperation({
        action: 'dividend_payment_void',
        entityType: 'dividendPayment',
        entityId: paymentId,
        beforeSnapshot: snapshot(before),
        afterSnapshot: snapshot(after),
        note: reason.trim(),
      })
    })
  }

  async saveAdjustmentRecord(record: AdjustmentRecord): Promise<void> {
    const reason = record.reason.trim()

    if (!reason) {
      throw new Error('调整记录必须填写原因。')
    }

    await this.db.transaction(
      'rw',
      this.db.adjustmentRecords,
      this.db.monthlySettlements,
      this.db.operationLogs,
      async () => {
      const targetSettlement = await this.db.monthlySettlements
        .where('month')
        .equals(record.targetMonth)
        .first()

      if (!targetSettlement || !isFinalizedSettlementStatus(targetSettlement.status)) {
        throw new Error('只能为已锁定月份新增调整记录。')
      }

      const saved = stamp({ ...record, reason })
      await this.db.adjustmentRecords.put(saved)

      if (targetSettlement.status === 'locked') {
        await this.db.monthlySettlements.update(targetSettlement.id, {
          status: 'adjusted',
          updatedAt: nowIso(),
        })
      }
      await this.logOperation({
        action: 'adjustment_record_create',
        entityType: 'adjustmentRecord',
        entityId: saved.id,
        afterSnapshot: snapshot(saved),
      })
      },
    )
  }

  async saveAnnualDividendConfirmation(record: AnnualDividendConfirmation): Promise<void> {
    await this.db.transaction('rw', this.db.annualDividendConfirmations, this.db.operationLogs, async () => {
      const before = await this.db.annualDividendConfirmations.get(record.id)
      const saved = stamp(record)
      await this.db.annualDividendConfirmations.put(saved)
      await this.logOperation({
        action: before ? 'annual_confirmation_update' : 'annual_confirmation_create',
        entityType: 'annualDividendConfirmation',
        entityId: saved.id,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: snapshot(saved),
      })
    })
  }

  async saveAnnualDividendConfirmations(records: AnnualDividendConfirmation[]): Promise<void> {
    await this.db.transaction('rw', this.db.annualDividendConfirmations, this.db.operationLogs, async () => {
      const savedRecords = records.map(stamp)
      await this.db.annualDividendConfirmations.bulkPut(savedRecords)
      await Promise.all(
        savedRecords.map((record) =>
          this.logOperation({
            action: 'annual_confirmation_generate',
            entityType: 'annualDividendConfirmation',
            entityId: record.id,
            afterSnapshot: snapshot(record),
          }),
        ),
      )
    })
  }

  async saveOperationLog(log: OperationLog): Promise<void> {
    await this.db.operationLogs.put({
      ...log,
      createdAt: log.createdAt || nowIso(),
    })
  }

  async saveProfitCalculatorRecord(record: ProfitCalculatorRecord): Promise<void> {
    await this.db.profitCalculatorRecords.put(stamp(normalizeProfitCalculatorRecord(record)))
  }

  async importData(data: AppData, options: { overwriteLocked?: boolean } = {}): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.members,
        this.db.capitalLots,
        this.db.capitalTransactions,
        this.db.monthlySettlements,
        this.db.monthlyAllocations,
        this.db.dividendPayments,
        this.db.adjustmentRecords,
        this.db.annualDividendConfirmations,
        this.db.operationLogs,
        this.db.profitCalculatorRecords,
      ],
      async () => {
        const currentSettlements = await this.db.monthlySettlements.toArray()
        const currentAllocations = await this.db.monthlyAllocations.toArray()
        const allocationProtection = validateImportAllocationsAgainstLockedSettlements({
          currentSettlements,
          currentAllocations,
          importedSettlements: data.monthlySettlements,
          importedAllocations: data.monthlyAllocations,
        })

        if (allocationProtection.summary.abnormalAllocationCount > 0) {
          throw new Error(
            `备份文件包含 ${allocationProtection.summary.abnormalAllocationCount} 条无法关联结算月份的收益明细。为保护账务数据，系统已阻止导入。`,
          )
        }

        for (const importedSettlement of data.monthlySettlements) {
          const existing = currentSettlements.find((settlement) => settlement.month === importedSettlement.month)

          if (
            existing &&
            isFinalizedSettlementStatus(existing.status) &&
            !options.overwriteLocked
          ) {
            throw new Error(`导入包含已锁定月份 ${existing.month}，未确认覆盖前已阻止导入。`)
          }
        }

        await Promise.all([
          data.members.length ? this.db.members.bulkPut(data.members) : Promise.resolve(),
          data.capitalLots.length ? this.db.capitalLots.bulkPut(data.capitalLots) : Promise.resolve(),
          data.capitalTransactions.length
            ? this.db.capitalTransactions.bulkPut(data.capitalTransactions.map(normalizeCapitalTransaction))
            : Promise.resolve(),
          data.monthlySettlements.length
            ? this.db.monthlySettlements.bulkPut(data.monthlySettlements.map(normalizeMonthlySettlement))
            : Promise.resolve(),
          allocationProtection.importableAllocations.length
            ? this.db.monthlyAllocations.bulkPut(allocationProtection.importableAllocations)
            : Promise.resolve(),
          data.dividendPayments.length
            ? this.db.dividendPayments.bulkPut(data.dividendPayments.map(normalizeDividendPayment))
            : Promise.resolve(),
          data.adjustmentRecords.length ? this.db.adjustmentRecords.bulkPut(data.adjustmentRecords) : Promise.resolve(),
          data.annualDividendConfirmations.length
            ? this.db.annualDividendConfirmations.bulkPut(data.annualDividendConfirmations)
            : Promise.resolve(),
          data.operationLogs.length ? this.db.operationLogs.bulkPut(data.operationLogs) : Promise.resolve(),
          data.profitCalculatorRecords.length
            ? this.db.profitCalculatorRecords.bulkPut(
                data.profitCalculatorRecords.map(normalizeProfitCalculatorRecord),
              )
            : Promise.resolve(),
        ])
        await this.logOperation({
          action: 'backup_import',
          entityType: 'backup',
          entityId: 'indexeddb',
          afterSnapshot: snapshot({
            members: data.members.length,
            capitalLots: data.capitalLots.length,
            monthlySettlements: data.monthlySettlements.length,
            dividendPayments: data.dividendPayments.length,
            importableAllocations: allocationProtection.summary.importableAllocationCount,
            protectedSkippedAllocations: allocationProtection.summary.protectedSkippedAllocationCount,
            abnormalAllocations: allocationProtection.summary.abnormalAllocationCount,
            protectedMonths: allocationProtection.summary.protectedMonths,
          }),
        })
      },
    )
  }

  async clearLocalData(options: ClearLocalDataOptions = {}): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.members,
        this.db.capitalLots,
        this.db.capitalTransactions,
        this.db.monthlySettlements,
        this.db.monthlyAllocations,
        this.db.dividendPayments,
        this.db.adjustmentRecords,
        this.db.annualDividendConfirmations,
        this.db.operationLogs,
        this.db.profitCalculatorRecords,
      ],
      async () => {
        const counts: ClearLocalDataCounts = {
          members: await this.db.members.count(),
          capitalLots: await this.db.capitalLots.count(),
          capitalTransactions: await this.db.capitalTransactions.count(),
          monthlySettlements: await this.db.monthlySettlements.count(),
          monthlyAllocations: await this.db.monthlyAllocations.count(),
          dividendPayments: await this.db.dividendPayments.count(),
          adjustmentRecords: await this.db.adjustmentRecords.count(),
          annualDividendConfirmations: await this.db.annualDividendConfirmations.count(),
          operationLogs: await this.db.operationLogs.count(),
          profitCalculatorRecords: await this.db.profitCalculatorRecords.count(),
        }

        assertCanClearLocalData(counts, options)

        await Promise.all([
          this.db.members.clear(),
          this.db.capitalLots.clear(),
          this.db.capitalTransactions.clear(),
          this.db.monthlySettlements.clear(),
          this.db.monthlyAllocations.clear(),
          this.db.dividendPayments.clear(),
          this.db.adjustmentRecords.clear(),
          this.db.annualDividendConfirmations.clear(),
          this.db.operationLogs.clear(),
          this.db.profitCalculatorRecords.clear(),
        ])

        await this.db.operationLogs.put({
          id: createId('op_log'),
          action: 'local_data_clear',
          entityType: 'system',
          entityId: 'local_indexeddb',
          beforeSnapshot: snapshot(counts),
          afterSnapshot: snapshot({
            members: 0,
            capitalLots: 0,
            capitalTransactions: 0,
            monthlySettlements: 0,
            monthlyAllocations: 0,
            dividendPayments: 0,
            adjustmentRecords: 0,
            annualDividendConfirmations: 0,
            operationLogs: 1,
            profitCalculatorRecords: 0,
          }),
          note: options.reason?.trim() || '用户手动清除本地数据',
          createdAt: nowIso(),
        })
      },
    )
  }

  /** 仅限空库演示数据初始化，不得用于普通导入恢复。 */
  async replaceAllData(data: AppData, options: DangerousReplaceOptions = {}): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.members,
        this.db.capitalLots,
        this.db.capitalTransactions,
        this.db.monthlySettlements,
        this.db.monthlyAllocations,
        this.db.dividendPayments,
        this.db.adjustmentRecords,
        this.db.annualDividendConfirmations,
        this.db.operationLogs,
        this.db.profitCalculatorRecords,
      ],
      async () => {
        const currentCounts: CoreBusinessDataCounts = {
          members: await this.db.members.count(),
          capitalLots: await this.db.capitalLots.count(),
          monthlySettlements: await this.db.monthlySettlements.count(),
          monthlyAllocations: await this.db.monthlyAllocations.count(),
          dividendPayments: await this.db.dividendPayments.count(),
        }
        assertCanUnsafeReplaceAllDataForDemoOnly(currentCounts, options)

        await Promise.all([
          this.db.members.clear(),
          this.db.capitalLots.clear(),
          this.db.capitalTransactions.clear(),
          this.db.monthlySettlements.clear(),
          this.db.monthlyAllocations.clear(),
          this.db.dividendPayments.clear(),
          this.db.adjustmentRecords.clear(),
          this.db.annualDividendConfirmations.clear(),
          this.db.operationLogs.clear(),
          this.db.profitCalculatorRecords.clear(),
        ])
        await Promise.all([
          this.db.members.bulkPut(data.members),
          this.db.capitalLots.bulkPut(data.capitalLots),
          this.db.capitalTransactions.bulkPut(data.capitalTransactions.map(normalizeCapitalTransaction)),
          this.db.monthlySettlements.bulkPut(data.monthlySettlements.map(normalizeMonthlySettlement)),
          this.db.monthlyAllocations.bulkPut(data.monthlyAllocations),
          this.db.dividendPayments.bulkPut(data.dividendPayments.map(normalizeDividendPayment)),
          this.db.adjustmentRecords.bulkPut(data.adjustmentRecords),
          this.db.annualDividendConfirmations.bulkPut(data.annualDividendConfirmations),
          this.db.operationLogs.bulkPut(data.operationLogs),
          this.db.profitCalculatorRecords.bulkPut(
            data.profitCalculatorRecords.map(normalizeProfitCalculatorRecord),
          ),
        ])
      },
    )
  }
}
