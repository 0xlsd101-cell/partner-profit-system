import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { emptyAppData } from '../domain/types'
import { buildJsonExport } from './exportImport'
import {
  decodeSqlitePayload,
  encodeSqlitePayload,
  SQLITE_CONNECTION_STRING,
  SQLITE_SCHEMA_VERSION,
  SQLITE_TABLES,
  sqliteClearBusinessDataSql,
  sqliteCreateTableSql,
  sqliteMigrationSql,
} from './sqliteSchema'

describe('sqlite schema', () => {
  it('covers every app data collection', () => {
    const appDataKeys = Object.keys(emptyAppData).sort()
    const sqliteKeys = SQLITE_TABLES.map((table) => table.key).sort()

    expect(sqliteKeys).toEqual(appDataKeys)
  })

  it('uses the desktop sqlite connection string', () => {
    expect(SQLITE_CONNECTION_STRING).toBe('sqlite:partner-profit-system.sqlite')
    expect(SQLITE_SCHEMA_VERSION).toBe('1')
  })

  it('preserves money fields as strings inside payloads', () => {
    const payload = encodeSqlitePayload({
      id: 'settlement_1',
      totalCapital: '12345678901234567890.12',
      partnerAnnualRate: '0.06',
    })
    const restored = decodeSqlitePayload<{ totalCapital: string; partnerAnnualRate: string }>(payload)

    expect(restored.totalCapital).toBe('12345678901234567890.12')
    expect(restored.partnerAnnualRate).toBe('0.06')
  })

  it('creates payload tables and migration sql for locked-data protection indexes', () => {
    expect(sqliteCreateTableSql('monthly_settlements')).toContain('payload TEXT NOT NULL')
    expect(sqliteCreateTableSql('monthly_settlements')).toContain('status TEXT')
    expect(sqliteMigrationSql()).toContain('CREATE INDEX IF NOT EXISTS idx_monthly_settlements_month')
    expect(sqliteMigrationSql()).toContain('CREATE INDEX IF NOT EXISTS idx_monthly_allocations_settlement_id')
  })

  it('clears every business table while preserving app metadata', () => {
    const clearSql = sqliteClearBusinessDataSql()

    for (const table of SQLITE_TABLES) {
      expect(clearSql).toContain(`DELETE FROM ${table.tableName}`)
    }

    expect(clearSql.join('\n')).not.toContain('app_metadata')
    expect(clearSql).toContain('DELETE FROM operation_logs')
  })

  it('does not use manual transaction statements in the desktop repository', () => {
    const source = readFileSync('src/storage/sqliteRepository.ts', 'utf8')

    expect(source).not.toMatch(/execute\(['"`]BEGIN/i)
    expect(source).not.toMatch(/execute\(['"`]COMMIT/i)
    expect(source).not.toMatch(/execute\(['"`]ROLLBACK/i)
  })

  it('exports every core collection in JSON backups', () => {
    const backup = JSON.parse(buildJsonExport(emptyAppData)) as Record<string, unknown>
    const nestedData = backup.data as Record<string, unknown>

    for (const key of Object.keys(emptyAppData)) {
      expect(nestedData).toHaveProperty(key)
    }

    expect(backup).toHaveProperty('calculatorRecords')
    expect(backup).toHaveProperty('schemaVersion')
    expect(backup).toHaveProperty('data')
  })
})
