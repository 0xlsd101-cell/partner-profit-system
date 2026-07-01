import { useMemo, useState } from 'react'
import {
  buildAnnualSummaryCsv,
  buildDividendPaymentsCsv,
  buildJsonExport,
  buildMonthlySettlementCsv,
  buildOperationLogsCsv,
  CURRENT_SCHEMA_VERSION,
  downloadTextFile,
  parseJsonImport,
} from '../storage/exportImport'
import {
  exportAnnualSummaryXlsx,
  exportDividendPaymentsXlsx,
  exportMonthlySettlementsYearXlsx,
  exportOperationLogsXlsx,
} from '../storage/xlsxReports'
import type { ImportAllocationProtectionSummary } from '../storage/importSafety'
import { validateImportAllocationsAgainstLockedSettlements } from '../storage/importSafety'
import {
  CLEAR_LOCAL_DATA_BACKUP_REMINDER,
  CLEAR_LOCAL_DATA_CONFIRM_HINT,
  CLEAR_LOCAL_DATA_CONFIRM_TEXT,
  CLEAR_LOCAL_DATA_RECOVERY_WARNING,
  CLEAR_LOCAL_DATA_SCOPE_DESCRIPTION,
  CLEAR_LOCAL_DATA_TITLE,
  totalClearableLocalDataCount,
  type ClearLocalDataCounts,
} from '../storage/dataClearSafety'
import { createSampleData } from '../storage/sampleData'
import { createId, nowIso } from '../utils/date'
import {
  annualSummaryFileName,
  buildBackupFileName,
  dividendPaymentsFileName,
  monthlySettlementFileName,
  operationLogsFileName,
} from '../utils/fileName'
import { formatDateTime, formatMonth } from '../utils/format'
import { Button, Field, Notice, NumberStepperInput, PageHeader, Panel } from '../components/common'
import type { AppData } from '../domain/types'
import type { PageProps } from './pageTypes'

interface DataSummary {
  version: number
  members: number
  capitalLots: number
  lockedMonths: number
  monthlyAllocations: number
  adjustments: number
  payments: number
  operationLogs: number
}

function summaryFromData(data: AppData, version = CURRENT_SCHEMA_VERSION): DataSummary {
  return {
    version,
    members: data.members.length,
    capitalLots: data.capitalLots.length,
    lockedMonths: data.monthlySettlements.filter(
      (settlement) => settlement.status === 'locked' || settlement.status === 'adjusted',
    ).length,
    monthlyAllocations: data.monthlyAllocations.length,
    adjustments: data.adjustmentRecords.length,
    payments: data.dividendPayments.length,
    operationLogs: data.operationLogs.length,
  }
}

function backupVersionFromRaw(raw: string): number {
  const parsed = JSON.parse(raw) as Record<string, unknown>

  return Number(parsed.schemaVersion ?? parsed.version ?? 0)
}

const summaryRows: Array<{ key: keyof DataSummary; label: string }> = [
  { key: 'version', label: '数据版本' },
  { key: 'members', label: '合伙人数量' },
  { key: 'capitalLots', label: '资金批次数量' },
  { key: 'lockedMonths', label: '已锁定月份数量' },
  { key: 'monthlyAllocations', label: '月度收益明细数量' },
  { key: 'adjustments', label: '调整记录数量' },
  { key: 'payments', label: '分红支付记录数量' },
  { key: 'operationLogs', label: '操作日志数量' },
]

const clearScopeRows: Array<{ key: keyof ClearLocalDataCounts; label: string; note?: string }> = [
  { key: 'members', label: '合伙人' },
  { key: 'capitalLots', label: '资金批次' },
  { key: 'capitalTransactions', label: '资金流水' },
  { key: 'monthlySettlements', label: '月度结算' },
  { key: 'monthlyAllocations', label: '月度收益明细' },
  { key: 'dividendPayments', label: '分红支付记录' },
  { key: 'adjustmentRecords', label: '调整记录' },
  { key: 'annualDividendConfirmations', label: '年度分红确认单' },
  { key: 'profitCalculatorRecords', label: '收益计算器记录' },
  { key: 'operationLogs', label: '操作日志', note: '清空旧日志后保留本次清除记录' },
]

export function BackupPage({ data, repository, reload, notify }: PageProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [backupText, setBackupText] = useState('')
  const [backupFileName, setBackupFileName] = useState('')
  const [backupSummary, setBackupSummary] = useState<DataSummary | undefined>()
  const [allocationProtectionSummary, setAllocationProtectionSummary] =
    useState<ImportAllocationProtectionSummary>()
  const [message, setMessage] = useState('')
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearReason, setClearReason] = useState('')
  const [clearMessage, setClearMessage] = useState('')
  const currentSummary = useMemo(() => summaryFromData(data), [data])
  const clearCounts: ClearLocalDataCounts = useMemo(
    () => ({
      members: data.members.length,
      capitalLots: data.capitalLots.length,
      capitalTransactions: data.capitalTransactions.length,
      monthlySettlements: data.monthlySettlements.length,
      monthlyAllocations: data.monthlyAllocations.length,
      dividendPayments: data.dividendPayments.length,
      adjustmentRecords: data.adjustmentRecords.length,
      annualDividendConfirmations: data.annualDividendConfirmations.length,
      operationLogs: data.operationLogs.length,
      profitCalculatorRecords: data.profitCalculatorRecords.length,
    }),
    [data],
  )
  const clearableRecordCount = totalClearableLocalDataCount(clearCounts)
  const canClearLocalData = clearConfirmText.trim() === CLEAR_LOCAL_DATA_CONFIRM_TEXT && clearableRecordCount > 0
  const latestBackupLog = data.operationLogs.find((log) => log.action === 'backup_export')
  const latestBackupAt = latestBackupLog?.createdAt
  const backupIsStale =
    !latestBackupAt || Date.now() - new Date(latestBackupAt).getTime() > 30 * 24 * 60 * 60 * 1000
  const isEmpty =
    data.members.length === 0 &&
    data.capitalLots.length === 0 &&
    data.capitalTransactions.length === 0 &&
    data.monthlySettlements.length === 0 &&
    data.monthlyAllocations.length === 0 &&
    data.dividendPayments.length === 0 &&
    data.adjustmentRecords.length === 0 &&
    data.profitCalculatorRecords.length === 0

  async function exportBackupFile() {
    downloadTextFile(
      buildBackupFileName(),
      buildJsonExport(data),
      'application/json;charset=utf-8',
    )
    await repository.saveOperationLog({
      id: createId('op_log'),
      action: 'backup_export',
      entityType: 'backup',
      entityId: 'local_backup',
      afterSnapshot: JSON.stringify({
        version: CURRENT_SCHEMA_VERSION,
        members: data.members.length,
        capitalLots: data.capitalLots.length,
        monthlySettlements: data.monthlySettlements.length,
        operationLogs: data.operationLogs.length,
      }),
      createdAt: nowIso(),
    })
    await reload()
    notify('完整备份文件已导出。')
  }

  function exportAnnualCsv() {
    downloadTextFile(
      annualSummaryFileName(year),
      buildAnnualSummaryCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('年度分红汇总报表已导出。')
  }

  function exportMonthlyCsv() {
    downloadTextFile(
      monthlySettlementFileName(year),
      buildMonthlySettlementCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('月度结算报表已导出。')
  }

  function exportPaymentsCsv() {
    downloadTextFile(
      dividendPaymentsFileName(year),
      buildDividendPaymentsCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('分红支付记录报表已导出。')
  }

  function exportOperationLogsCsv() {
    downloadTextFile(
      operationLogsFileName(year),
      buildOperationLogsCsv(data),
      'text/csv;charset=utf-8',
    )
    notify('操作日志报表已导出。')
  }

  async function exportAnnualExcel() {
    await exportAnnualSummaryXlsx(data, year)
    notify('年度分红汇总美化 Excel 已导出。')
  }

  async function exportMonthlyExcel() {
    await exportMonthlySettlementsYearXlsx(data, year)
    notify('月度结算美化 Excel 已导出。')
  }

  async function exportPaymentsExcel() {
    await exportDividendPaymentsXlsx(data, year)
    notify('分红支付记录美化 Excel 已导出。')
  }

  async function exportOperationLogsExcel() {
    await exportOperationLogsXlsx(data, year)
    notify('操作日志美化 Excel 已导出。')
  }

function parseBackupSummary(raw: string) {
    const parsed = parseJsonImport(raw)
    const version = backupVersionFromRaw(raw)
    const allocationProtection = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: data.monthlySettlements,
      currentAllocations: data.monthlyAllocations,
      importedSettlements: parsed.monthlySettlements,
      importedAllocations: parsed.monthlyAllocations,
    })

    setBackupSummary(summaryFromData(parsed, version))
    setAllocationProtectionSummary(allocationProtection.summary)
    setMessage('')
  }

  function showImportSummary() {
    try {
      parseBackupSummary(backupText)
    } catch (err) {
      setBackupSummary(undefined)
      setAllocationProtectionSummary(undefined)
      setMessage(err instanceof Error ? err.message : '备份文件摘要解析失败。')
    }
  }

  function handleFile(file?: File) {
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      setBackupText(raw)
      setBackupFileName(file.name)

      try {
        parseBackupSummary(raw)
      } catch (err) {
        setBackupSummary(undefined)
        setAllocationProtectionSummary(undefined)
        setMessage(err instanceof Error ? err.message : '备份文件摘要解析失败。')
      }
    }
    reader.readAsText(file)
  }

  function cancelImport() {
    setBackupText('')
    setBackupFileName('')
    setBackupSummary(undefined)
    setAllocationProtectionSummary(undefined)
    setMessage('')
  }

  async function importBackupFile() {
    try {
      const parsed = parseJsonImport(backupText)
      const allocationProtection = validateImportAllocationsAgainstLockedSettlements({
        currentSettlements: data.monthlySettlements,
        currentAllocations: data.monthlyAllocations,
        importedSettlements: parsed.monthlySettlements,
        importedAllocations: parsed.monthlyAllocations,
      })

      if (allocationProtection.summary.abnormalAllocationCount > 0) {
        setMessage(
          `备份文件包含 ${allocationProtection.summary.abnormalAllocationCount} 条无法关联结算月份的收益明细。为保护账务数据，系统已阻止导入。`,
        )
        return
      }

      const firstConfirm = window.confirm('导入备份会合并写入当前本地数据。请确认已先导出当前完整备份文件。')

      if (!firstConfirm) {
        return
      }

      const finalizedMonths = new Set(
        data.monthlySettlements
          .filter((settlement) => settlement.status === 'locked' || settlement.status === 'adjusted')
          .map((settlement) => settlement.month),
      )
      const lockedConflicts = parsed.monthlySettlements
        .filter((settlement) => finalizedMonths.has(settlement.month))
        .map((settlement) => formatMonth(settlement.month))
      let overwriteLocked = false

      if (lockedConflicts.length > 0) {
        overwriteLocked = window.confirm(
          `备份文件包含当前已锁定或已调整月份：${lockedConflicts.join('、')}。确认覆盖这些月份的数据吗？`,
        )

        if (!overwriteLocked) {
          setMessage('已阻止导入：备份文件会覆盖当前已锁定或已调整月份。')
          return
        }
      }

      await repository.importData(parsed, { overwriteLocked })
      await reload()
      const skippedCount = allocationProtection.summary.protectedSkippedAllocationCount
      cancelImport()
      notify(
        skippedCount > 0
          ? `备份文件已合并导入，已保护跳过 ${skippedCount} 条已锁定月份收益明细。`
          : '备份文件已合并导入。',
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导入失败。')
    }
  }

  async function loadSampleData() {
    if (!isEmpty) {
      setMessage('演示数据只允许在空数据库中载入，避免覆盖或混入真实数据。')
      return
    }

    const ok = window.confirm('确认载入演示数据？该操作只会写入当前空的本地数据。')

    if (!ok) {
      return
    }

    await repository.replaceAllData(createSampleData(), { confirmDangerousReplace: true })
    await reload()
    setMessage('')
    notify('演示数据已载入。')
  }

  async function clearLocalData() {
    if (clearConfirmText.trim() !== CLEAR_LOCAL_DATA_CONFIRM_TEXT) {
      setClearMessage(`请输入“${CLEAR_LOCAL_DATA_CONFIRM_TEXT}”后再执行清除。`)
      return
    }

    if (clearableRecordCount === 0) {
      setClearMessage('当前系统没有可清除的本地数据。')
      return
    }

    const backupConfirm = window.confirm(
      `${CLEAR_LOCAL_DATA_RECOVERY_WARNING}${CLEAR_LOCAL_DATA_BACKUP_REMINDER}是否继续？`,
    )

    if (!backupConfirm) {
      return
    }

    const finalConfirm = window.confirm(
      `最后确认：将清除当前浏览器中的 ${clearableRecordCount} 条本地记录，包括已锁定月份、收益明细和支付记录。系统只会保留本次清除操作日志。是否继续？`,
    )

    if (!finalConfirm) {
      return
    }

    try {
      await repository.clearLocalData({
        confirmClearData: true,
        confirmationText: clearConfirmText.trim(),
        reason: clearReason.trim() || undefined,
      })
      cancelImport()
      setClearConfirmText('')
      setClearReason('')
      setClearMessage('')
      await reload()
      notify('本地数据已清除，系统已保留本次清除操作记录。')
    } catch (err) {
      setClearMessage(err instanceof Error ? err.message : '清除本地数据失败。')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="数据备份"
        description="本系统只使用浏览器本地数据，不接入云服务。"
      />

      <Panel title="备份验收">
        <div className="summary-grid">
          <div className="summary-item">
            <span>最近一次备份时间</span>
            <strong>{latestBackupAt ? formatDateTime(latestBackupAt) : '暂无备份记录'}</strong>
            <small>以完整备份文件导出记录为准</small>
          </div>
          <div className="summary-item">
            <span>当前数据版本</span>
            <strong>第 {CURRENT_SCHEMA_VERSION} 版</strong>
            <small>导入备份时会校验数据版本</small>
          </div>
          <div className="summary-item">
            <span>数据状态</span>
            <strong className={backupIsStale ? 'danger-text' : ''}>
              {backupIsStale ? '需要备份' : '正常'}
            </strong>
            <small>超过 30 天未备份会提醒</small>
          </div>
          <div className="summary-item">
            <span>备份建议</span>
            <strong>{backupIsStale ? '立即导出' : '定期归档'}</strong>
            <small>{backupIsStale ? '建议先导出完整备份文件' : '建议每月结算后导出备份'}</small>
          </div>
        </div>
        {backupIsStale ? <Notice tone="warning">已超过 30 天未完成完整备份，请先导出备份再进行高风险操作。</Notice> : null}
      </Panel>

      <Panel title="当前数据摘要">
        <div className="count-grid">
          {summaryRows.map((row) => (
            <span key={row.key}>{row.label}：<strong>{currentSummary[row.key]}</strong></span>
          ))}
        </div>
      </Panel>

      <Panel title="导出报表" description="完整备份用于恢复数据，报表用于人工核对和归档。">
        <div className="toolbar-row">
          <Button type="button" variant="primary" onClick={exportBackupFile}>导出完整备份文件</Button>
          <NumberStepperInput
            className="compact-input"
            value={year}
            aria-label="导出年份"
            onValueChange={(value) => setYear(Number(value))}
          />
          <Button type="button" onClick={exportAnnualCsv}>导出年度分红汇总</Button>
          <Button type="button" onClick={exportAnnualExcel}>导出年度汇总 Excel</Button>
          <Button type="button" onClick={exportMonthlyCsv}>导出月度结算明细</Button>
          <Button type="button" onClick={exportMonthlyExcel}>导出月度结算 Excel</Button>
          <Button type="button" onClick={exportPaymentsCsv}>导出分红支付记录</Button>
          <Button type="button" onClick={exportPaymentsExcel}>导出支付记录 Excel</Button>
          <Button type="button" onClick={exportOperationLogsCsv}>导出操作日志</Button>
          <Button type="button" onClick={exportOperationLogsExcel}>导出操作日志 Excel</Button>
        </div>
      </Panel>

      <Panel title="导入备份文件" description="导入前请先导出当前完整备份。系统会先展示中文摘要，再由你确认是否导入。">
        <div className="form-grid">
          <Field label="选择备份文件">
            <input type="file" accept="application/json,.json" onChange={(event) => handleFile(event.target.files?.[0])} />
          </Field>
        </div>
        {backupFileName ? <Notice tone="info">已选择备份文件：{backupFileName}</Notice> : null}
        {backupSummary ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>核对项目</th>
                    <th className="number-cell">当前系统</th>
                    <th className="number-cell">备份文件</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td className="number-cell">{currentSummary[row.key]}</td>
                      <td className="number-cell">{backupSummary[row.key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allocationProtectionSummary ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>导入保护项目</th>
                      <th className="number-cell">数量或月份</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>可导入收益明细数量</td>
                      <td className="number-cell">{allocationProtectionSummary.importableAllocationCount}</td>
                    </tr>
                    <tr>
                      <td>被保护跳过的收益明细数量</td>
                      <td className="number-cell">{allocationProtectionSummary.protectedSkippedAllocationCount}</td>
                    </tr>
                    <tr>
                      <td>异常收益明细数量</td>
                      <td className="number-cell">{allocationProtectionSummary.abnormalAllocationCount}</td>
                    </tr>
                    <tr>
                      <td>涉及的锁定或已调整月份</td>
                      <td className="number-cell">
                        {allocationProtectionSummary.protectedMonths.length > 0
                          ? allocationProtectionSummary.protectedMonths.map(formatMonth).join('、')
                          : '无'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            {allocationProtectionSummary?.protectedSkippedAllocationCount ? (
              <Notice tone="warning">
                备份文件包含已锁定月份的收益明细。为保护历史账务，系统已阻止覆盖这些明细。
              </Notice>
            ) : null}
            <Notice tone="warning">
              导入影响说明：导入会合并写入本地数据；如备份文件包含当前已锁定或已调整月份，系统会再次要求确认覆盖。
            </Notice>
          </>
        ) : null}
        <div className="toolbar-row">
          <Button type="button" onClick={showImportSummary} disabled={!backupText.trim()}>
            查看导入摘要
          </Button>
          <Button type="button" variant="danger" onClick={importBackupFile} disabled={!backupText.trim() || !backupSummary}>
            确认导入
          </Button>
          <Button type="button" onClick={cancelImport} disabled={!backupText.trim()}>
            取消
          </Button>
          <Button type="button" onClick={loadSampleData}>载入测试样例数据</Button>
        </div>
        {message ? <Notice tone="warning">{message}</Notice> : null}
      </Panel>

      <Panel
        title={CLEAR_LOCAL_DATA_TITLE}
        description="高风险操作：仅清除当前浏览器中的本地业务数据，不影响已导出的备份文件。"
      >
        <Notice tone="danger">
          <strong>{CLEAR_LOCAL_DATA_SCOPE_DESCRIPTION}</strong>
          <span>{CLEAR_LOCAL_DATA_RECOVERY_WARNING}</span>
          <span>{CLEAR_LOCAL_DATA_BACKUP_REMINDER}</span>
        </Notice>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>清除范围</th>
                <th className="number-cell">当前数量</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {clearScopeRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="number-cell">{clearCounts[row.key]}</td>
                  <td>{row.note ?? '将被清除'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-grid">
          <Field label="确认文字" hint={CLEAR_LOCAL_DATA_CONFIRM_HINT}>
            <input
              value={clearConfirmText}
              onChange={(event) => {
                setClearConfirmText(event.target.value)
                setClearMessage('')
              }}
              placeholder={CLEAR_LOCAL_DATA_CONFIRM_TEXT}
            />
          </Field>
          <Field label="清除原因" hint="可选，会记录到操作日志。">
            <input
              value={clearReason}
              onChange={(event) => setClearReason(event.target.value)}
              placeholder="例如：试运行结束，准备重新录入正式数据"
            />
          </Field>
        </div>
        <div className="toolbar-row">
          <Button type="button" variant="primary" onClick={exportBackupFile}>
            先导出完整备份文件
          </Button>
          <Button
            type="button"
            onClick={() => {
              setClearConfirmText('')
              setClearReason('')
              setClearMessage('')
            }}
          >
            取消
          </Button>
          <Button type="button" variant="danger" onClick={clearLocalData} disabled={!canClearLocalData}>
            我已备份，确认清除
          </Button>
        </div>
        {clearMessage ? <Notice tone="warning">{clearMessage}</Notice> : null}
      </Panel>

      <Notice tone="info">
        数据安全确认：此页不会自动上传、同步或静默清空数据；导入默认合并写入，不会删除本地未出现在备份里的记录。
      </Notice>
    </div>
  )
}
