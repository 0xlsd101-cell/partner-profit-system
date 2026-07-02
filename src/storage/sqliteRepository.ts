import Database from '@tauri-apps/plugin-sql'
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
import { emptyAppData } from '../domain/types'
import {
  capitalLotFromTransaction,
  isFinalizedSettlementStatus,
  normalizeCapitalTransaction,
  normalizeDividendPayment,
  normalizeMonthlySettlement,
} from '../domain/calculation'
import { normalizeProfitCalculatorRecord } from '../domain/profitCalculator'
import { createId, nowIso } from '../utils/date'
import type { PartnerRepository } from './repository'
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
import {
  decodeSqlitePayload,
  encodeSqlitePayload,
  SQLITE_CONNECTION_STRING,
  sqliteClearBusinessDataSql,
  SQLITE_SCHEMA_VERSION,
  SQLITE_TABLE_BY_KEY,
  SQLITE_TABLES,
  sqliteCreateIndexSql,
  sqliteCreateTableSql,
  type SqliteCollectionKey,
} from './sqliteSchema'

type SqliteRecord = AppData[SqliteCollectionKey][number]
type PayloadRow = { payload: string }
type CountRow = { count: number }

interface RecordIndexes {
  month: string | null
  year: number | null
  memberId: string | null
  settlementId: string | null
  status: string | null
  name: string | null
  createdAt: string | null
  updatedAt: string | null
  recordType: string | null
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

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableYear(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function recordIndexes(record: SqliteRecord): RecordIndexes {
  const value = record as unknown as Record<string, unknown>

  return {
    month: nullableString(value.month) ?? nullableString(value.targetMonth) ?? nullableString(value.effectiveMonth),
    year: nullableYear(value.year),
    memberId: nullableString(value.memberId),
    settlementId: nullableString(value.settlementId),
    status: nullableString(value.status),
    name: nullableString(value.name) ?? nullableString(value.memberName),
    createdAt: nullableString(value.createdAt),
    updatedAt: nullableString(value.updatedAt),
    recordType: nullableString(value.recordType),
  }
}

export class SqliteRepository implements PartnerRepository {
  private dbPromise: Promise<Database> | undefined

  private async getDb(): Promise<Database> {
    this.dbPromise ??= this.openDb()
    return this.dbPromise
  }

  private async openDb(): Promise<Database> {
    const db = await Database.load(SQLITE_CONNECTION_STRING)
    await this.ensureSchema(db)
    return db
  }

  private async ensureSchema(db: Database): Promise<void> {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    await db.execute(
      `INSERT OR IGNORE INTO app_metadata (key, value, updated_at)
        VALUES ($1, $2, $3)`,
      ['schemaVersion', SQLITE_SCHEMA_VERSION, nowIso()],
    )

    for (const table of SQLITE_TABLES) {
      await db.execute(sqliteCreateTableSql(table.tableName))

      for (const indexSql of sqliteCreateIndexSql(table.tableName)) {
        await db.execute(indexSql)
      }
    }
  }

  private async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.getDb()

    // Tauri SQL does not expose a stable JS transaction helper. Manual
    // BEGIN/COMMIT statements fail in the desktop WebView runtime, causing
    // write flows such as JSON import and local-data clearing to be rejected.
    // Keep validation in the repository and execute the storage writes in
    // sequence so Web and desktop modes share the same page-level contract.
    return operation()
  }

  private async selectAll<T extends SqliteRecord>(key: SqliteCollectionKey): Promise<T[]> {
    const db = await this.getDb()
    const table = SQLITE_TABLE_BY_KEY[key]
    const rows = await db.select<PayloadRow[]>(`SELECT payload FROM ${table.tableName}`)
    return rows.map((row) => decodeSqlitePayload<T>(row.payload))
  }

  private async getRecord<T extends SqliteRecord>(
    key: SqliteCollectionKey,
    id: RecordId,
  ): Promise<T | undefined> {
    const db = await this.getDb()
    const table = SQLITE_TABLE_BY_KEY[key]
    const rows = await db.select<PayloadRow[]>(
      `SELECT payload FROM ${table.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    )

    return rows[0] ? decodeSqlitePayload<T>(rows[0].payload) : undefined
  }

  private async putRecord(key: SqliteCollectionKey, record: SqliteRecord): Promise<void> {
    const db = await this.getDb()
    const table = SQLITE_TABLE_BY_KEY[key]
    const indexes = recordIndexes(record)

    await db.execute(
      `INSERT INTO ${table.tableName}
        (id, payload, month, year, member_id, settlement_id, status, name, created_at, updated_at, record_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT(id) DO UPDATE SET
          payload = excluded.payload,
          month = excluded.month,
          year = excluded.year,
          member_id = excluded.member_id,
          settlement_id = excluded.settlement_id,
          status = excluded.status,
          name = excluded.name,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          record_type = excluded.record_type`,
      [
        record.id,
        encodeSqlitePayload(record),
        indexes.month,
        indexes.year,
        indexes.memberId,
        indexes.settlementId,
        indexes.status,
        indexes.name,
        indexes.createdAt,
        indexes.updatedAt,
        indexes.recordType,
      ],
    )
  }

  private async bulkPut(key: SqliteCollectionKey, records: SqliteRecord[]): Promise<void> {
    for (const record of records) {
      await this.putRecord(key, record)
    }
  }

  private async deleteRecord(key: SqliteCollectionKey, id: RecordId): Promise<void> {
    const db = await this.getDb()
    const table = SQLITE_TABLE_BY_KEY[key]
    await db.execute(`DELETE FROM ${table.tableName} WHERE id = $1`, [id])
  }

  private async deleteAllocationsBySettlementId(settlementId: RecordId): Promise<void> {
    const db = await this.getDb()
    await db.execute('DELETE FROM monthly_allocations WHERE settlement_id = $1', [settlementId])
  }

  private async clearTable(key: SqliteCollectionKey): Promise<void> {
    const db = await this.getDb()
    await db.execute(`DELETE FROM ${SQLITE_TABLE_BY_KEY[key].tableName}`)
  }

  private async countTable(key: SqliteCollectionKey): Promise<number> {
    const db = await this.getDb()
    const rows = await db.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM ${SQLITE_TABLE_BY_KEY[key].tableName}`,
    )
    return rows[0]?.count ?? 0
  }

  private async logOperation(input: Omit<OperationLog, 'id' | 'createdAt'>): Promise<void> {
    await this.putRecord('operationLogs', {
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
      this.selectAll<Member>('members'),
      this.selectAll<CapitalLot>('capitalLots'),
      this.selectAll<CapitalTransaction>('capitalTransactions'),
      this.selectAll<MonthlySettlement>('monthlySettlements'),
      this.selectAll<MonthlyAllocation>('monthlyAllocations'),
      this.selectAll<DividendPayment>('dividendPayments'),
      this.selectAll<AdjustmentRecord>('adjustmentRecords'),
      this.selectAll<AnnualDividendConfirmation>('annualDividendConfirmations'),
      this.selectAll<OperationLog>('operationLogs'),
      this.selectAll<ProfitCalculatorRecord>('profitCalculatorRecords'),
    ])

    const normalizedTransactions = capitalTransactions.map(normalizeCapitalTransaction)
    const lotIds = new Set(capitalLots.map((lot) => lot.id))
    const derivedMissingLots = normalizedTransactions.flatMap((transaction) => {
      const lot = capitalLotFromTransaction(transaction)
      return lot && !lotIds.has(lot.id) ? [lot] : []
    })
    const mergedCapitalLots = [...capitalLots, ...derivedMissingLots]

    return {
      ...emptyAppData,
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
    await this.withTransaction(async () => {
      const before = await this.getRecord<Member>('members', member.id)
      const saved = stamp(member)
      await this.putRecord('members', saved)
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
    await this.withTransaction(async () => {
      const members = await this.selectAll<Member>('members')
      const before = members.find((member) => member.id === memberId)
      const now = nowIso()

      for (const member of members) {
        await this.putRecord('members', {
          ...member,
          role: member.id === memberId ? 'manager' : 'partner',
          updatedAt: now,
        })
      }

      const after = await this.getRecord<Member>('members', memberId)
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
    await this.withTransaction(async () => {
      const before = await this.getRecord<Member>('members', memberId)

      if (!before) {
        return
      }

      const after = { ...before, status, updatedAt: nowIso() }
      await this.putRecord('members', after)
      await this.logOperation({
        action: 'member_status_update',
        entityType: 'member',
        entityId: memberId,
        beforeSnapshot: snapshot(before),
        afterSnapshot: snapshot(after),
      })
    })
  }

  async saveCapitalTransaction(transaction: CapitalTransaction): Promise<void> {
    const savedTransaction = stamp(normalizeCapitalTransaction(transaction))
    const lot = capitalLotFromTransaction(savedTransaction)

    await this.withTransaction(async () => {
      const before = await this.getRecord<CapitalTransaction>('capitalTransactions', savedTransaction.id)
      await this.putRecord('capitalTransactions', savedTransaction)
      await this.logOperation({
        action: before ? 'capital_transaction_update' : 'capital_transaction_create',
        entityType: 'capitalTransaction',
        entityId: savedTransaction.id,
        beforeSnapshot: before ? snapshot(before) : undefined,
        afterSnapshot: snapshot(savedTransaction),
      })

      if (lot) {
        const beforeLot = await this.getRecord<CapitalLot>('capitalLots', lot.id)
        const savedLot = stamp(lot)
        await this.putRecord('capitalLots', savedLot)
        await this.logOperation({
          action: beforeLot ? 'capital_lot_update' : 'capital_lot_create',
          entityType: 'capitalLot',
          entityId: savedLot.id,
          beforeSnapshot: beforeLot ? snapshot(beforeLot) : undefined,
          afterSnapshot: snapshot(savedLot),
        })
      }
    })
  }

  async saveCapitalLot(lot: CapitalLot): Promise<void> {
    await this.withTransaction(async () => {
      const before = await this.getRecord<CapitalLot>('capitalLots', lot.id)
      const saved = stamp(lot)
      await this.putRecord('capitalLots', saved)
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
    await this.withTransaction(async () => {
      const currentSettlements = await this.selectAll<MonthlySettlement>('monthlySettlements')
      const existing = currentSettlements.find((item) => item.month === settlement.month)

      if (existing && isFinalizedSettlementStatus(existing.status)) {
        throw new Error('已锁定或已调整月份不能直接修改，请新增调整记录。')
      }

      if (existing && existing.id !== settlement.id) {
        await this.deleteAllocationsBySettlementId(existing.id)
        await this.deleteRecord('monthlySettlements', existing.id)
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

      await this.putRecord('monthlySettlements', savedSettlement)
      await this.deleteAllocationsBySettlementId(savedSettlement.id)
      await this.bulkPut('monthlyAllocations', savedAllocations)
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
    })
  }

  async saveDividendPayment(payment: DividendPayment): Promise<void> {
    await this.withTransaction(async () => {
      const before = await this.getRecord<DividendPayment>('dividendPayments', payment.id)
      const saved = stamp(normalizeDividendPayment(payment))
      await this.putRecord('dividendPayments', saved)
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
    await this.withTransaction(async () => {
      const before = await this.getRecord<DividendPayment>('dividendPayments', paymentId)

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
      await this.putRecord('dividendPayments', after)
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

    await this.withTransaction(async () => {
      const settlements = await this.selectAll<MonthlySettlement>('monthlySettlements')
      const targetSettlement = settlements.find((settlement) => settlement.month === record.targetMonth)

      if (!targetSettlement || !isFinalizedSettlementStatus(targetSettlement.status)) {
        throw new Error('只能为已锁定月份新增调整记录。')
      }

      const saved = stamp({ ...record, reason })
      await this.putRecord('adjustmentRecords', saved)

      if (targetSettlement.status === 'locked') {
        await this.putRecord('monthlySettlements', {
          ...targetSettlement,
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
    })
  }

  async saveAnnualDividendConfirmation(record: AnnualDividendConfirmation): Promise<void> {
    await this.withTransaction(async () => {
      const before = await this.getRecord<AnnualDividendConfirmation>('annualDividendConfirmations', record.id)
      const saved = stamp(record)
      await this.putRecord('annualDividendConfirmations', saved)
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
    await this.withTransaction(async () => {
      const savedRecords = records.map(stamp)
      await this.bulkPut('annualDividendConfirmations', savedRecords)

      for (const record of savedRecords) {
        await this.logOperation({
          action: 'annual_confirmation_generate',
          entityType: 'annualDividendConfirmation',
          entityId: record.id,
          afterSnapshot: snapshot(record),
        })
      }
    })
  }

  async saveOperationLog(log: OperationLog): Promise<void> {
    await this.putRecord('operationLogs', {
      ...log,
      createdAt: log.createdAt || nowIso(),
    })
  }

  async saveProfitCalculatorRecord(record: ProfitCalculatorRecord): Promise<void> {
    await this.putRecord('profitCalculatorRecords', stamp(normalizeProfitCalculatorRecord(record)))
  }

  async importData(data: AppData, options: { overwriteLocked?: boolean } = {}): Promise<void> {
    await this.withTransaction(async () => {
      const currentSettlements = await this.selectAll<MonthlySettlement>('monthlySettlements')
      const currentAllocations = await this.selectAll<MonthlyAllocation>('monthlyAllocations')
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

      await this.bulkPut('members', data.members)
      await this.bulkPut('capitalLots', data.capitalLots)
      await this.bulkPut('capitalTransactions', data.capitalTransactions.map(normalizeCapitalTransaction))
      await this.bulkPut('monthlySettlements', data.monthlySettlements.map(normalizeMonthlySettlement))
      await this.bulkPut('monthlyAllocations', allocationProtection.importableAllocations)
      await this.bulkPut('dividendPayments', data.dividendPayments.map(normalizeDividendPayment))
      await this.bulkPut('adjustmentRecords', data.adjustmentRecords)
      await this.bulkPut('annualDividendConfirmations', data.annualDividendConfirmations)
      await this.bulkPut('operationLogs', data.operationLogs)
      await this.bulkPut(
        'profitCalculatorRecords',
        data.profitCalculatorRecords.map(normalizeProfitCalculatorRecord),
      )
      await this.logOperation({
        action: 'backup_import',
        entityType: 'backup',
        entityId: 'sqlite',
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
    })
  }

  async clearLocalData(options: ClearLocalDataOptions = {}): Promise<void> {
    await this.withTransaction(async () => {
      const counts: ClearLocalDataCounts = {
        members: await this.countTable('members'),
        capitalLots: await this.countTable('capitalLots'),
        capitalTransactions: await this.countTable('capitalTransactions'),
        monthlySettlements: await this.countTable('monthlySettlements'),
        monthlyAllocations: await this.countTable('monthlyAllocations'),
        dividendPayments: await this.countTable('dividendPayments'),
        adjustmentRecords: await this.countTable('adjustmentRecords'),
        annualDividendConfirmations: await this.countTable('annualDividendConfirmations'),
        operationLogs: await this.countTable('operationLogs'),
        profitCalculatorRecords: await this.countTable('profitCalculatorRecords'),
      }

      assertCanClearLocalData(counts, options)

      const db = await this.getDb()

      for (const statement of sqliteClearBusinessDataSql()) {
        await db.execute(statement)
      }
    })
  }

  async replaceAllData(data: AppData, options: DangerousReplaceOptions = {}): Promise<void> {
    await this.withTransaction(async () => {
      const currentCounts: CoreBusinessDataCounts = {
        members: await this.countTable('members'),
        capitalLots: await this.countTable('capitalLots'),
        monthlySettlements: await this.countTable('monthlySettlements'),
        monthlyAllocations: await this.countTable('monthlyAllocations'),
        dividendPayments: await this.countTable('dividendPayments'),
      }
      assertCanUnsafeReplaceAllDataForDemoOnly(currentCounts, options)

      for (const table of SQLITE_TABLES) {
        await this.clearTable(table.key)
      }

      await this.bulkPut('members', data.members)
      await this.bulkPut('capitalLots', data.capitalLots)
      await this.bulkPut('capitalTransactions', data.capitalTransactions.map(normalizeCapitalTransaction))
      await this.bulkPut('monthlySettlements', data.monthlySettlements.map(normalizeMonthlySettlement))
      await this.bulkPut('monthlyAllocations', data.monthlyAllocations)
      await this.bulkPut('dividendPayments', data.dividendPayments.map(normalizeDividendPayment))
      await this.bulkPut('adjustmentRecords', data.adjustmentRecords)
      await this.bulkPut('annualDividendConfirmations', data.annualDividendConfirmations)
      await this.bulkPut('operationLogs', data.operationLogs)
      await this.bulkPut(
        'profitCalculatorRecords',
        data.profitCalculatorRecords.map(normalizeProfitCalculatorRecord),
      )
    })
  }
}
