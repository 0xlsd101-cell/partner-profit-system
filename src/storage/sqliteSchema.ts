import type { AppData } from '../domain/types'

export const SQLITE_CONNECTION_STRING = 'sqlite:partner-profit-system.sqlite'
export const SQLITE_SCHEMA_VERSION = '1'

export type SqliteCollectionKey = keyof AppData

export interface SqliteTableSpec {
  key: SqliteCollectionKey
  tableName: string
}

export const SQLITE_TABLES = [
  { key: 'members', tableName: 'members' },
  { key: 'capitalLots', tableName: 'capital_lots' },
  { key: 'capitalTransactions', tableName: 'capital_transactions' },
  { key: 'monthlySettlements', tableName: 'monthly_settlements' },
  { key: 'monthlyAllocations', tableName: 'monthly_allocations' },
  { key: 'dividendPayments', tableName: 'dividend_payments' },
  { key: 'adjustmentRecords', tableName: 'adjustment_records' },
  { key: 'annualDividendConfirmations', tableName: 'annual_dividend_confirmations' },
  { key: 'operationLogs', tableName: 'operation_logs' },
  { key: 'profitCalculatorRecords', tableName: 'profit_calculator_records' },
] satisfies SqliteTableSpec[]

export const SQLITE_TABLE_BY_KEY = Object.fromEntries(
  SQLITE_TABLES.map((table) => [table.key, table]),
) as Record<SqliteCollectionKey, SqliteTableSpec>

export const SQLITE_CLEAR_TABLES = [...SQLITE_TABLES].reverse()

export const SQLITE_RECORD_COLUMNS = `
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
`

export function sqliteCreateTableSql(tableName: string): string {
  return `CREATE TABLE IF NOT EXISTS ${tableName} (${SQLITE_RECORD_COLUMNS})`
}

export function sqliteCreateIndexSql(tableName: string): string[] {
  return [
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_month ON ${tableName}(month)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_member_id ON ${tableName}(member_id)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_settlement_id ON ${tableName}(settlement_id)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_status ON ${tableName}(status)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_year ON ${tableName}(year)`,
  ]
}

export function encodeSqlitePayload(record: unknown): string {
  return JSON.stringify(record)
}

export function decodeSqlitePayload<T>(payload: string): T {
  return JSON.parse(payload) as T
}

export function sqliteMigrationSql(): string {
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `INSERT OR IGNORE INTO app_metadata (key, value, updated_at)
      VALUES ('schemaVersion', '${SQLITE_SCHEMA_VERSION}', datetime('now'))`,
    ...SQLITE_TABLES.flatMap((table) => [
      sqliteCreateTableSql(table.tableName),
      ...sqliteCreateIndexSql(table.tableName),
    ]),
  ]

  return statements.join(';\n')
}

export function sqliteClearBusinessDataSql(): string[] {
  return SQLITE_CLEAR_TABLES.map((table) => `DELETE FROM ${table.tableName}`)
}
