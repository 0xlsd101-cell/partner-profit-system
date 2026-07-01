import { useMemo } from 'react'
import {
  annualDividendConfirmationRecordId,
  calculateAnnualDividendConfirmationDrafts,
  getAnnualPeriod,
} from '../domain/calculation'
import type {
  AnnualDividendConfirmation as AnnualDividendConfirmationRecord,
  AnnualDividendConfirmationStatus,
  AppData,
} from '../domain/types'
import type { PartnerRepository } from '../storage/repository'
import {
  buildAnnualDividendConfirmationsCsv,
  downloadTextFile,
} from '../storage/exportImport'
import { exportAnnualDividendConfirmationsXlsx } from '../storage/xlsxReports'
import { nowIso, todayDate } from '../utils/date'
import { formatDate, formatMoney, formatRate } from '../utils/format'
import { Badge, Button, EmptyState, Notice, Panel } from './common'

const statusLabels: Record<AnnualDividendConfirmationStatus, string> = {
  not_generated: '未生成',
  generated: '已生成',
  sent: '已发送',
  confirmed: '已确认',
  paid: '已支付',
  archived: '已归档',
}

const statusOptions: AnnualDividendConfirmationStatus[] = [
  'generated',
  'sent',
  'confirmed',
  'paid',
  'archived',
]

function formatRateSummary(value: string): string {
  return value
    ? value
        .split(' | ')
        .filter(Boolean)
        .map((rate) => formatRate(rate))
        .join(' | ')
    : '-'
}

interface Props {
  data: AppData
  year: number
  repository: PartnerRepository
  reload: () => Promise<void>
  notify: (message: string) => void
}

export function AnnualDividendConfirmation({
  data,
  year,
  repository,
  reload,
  notify,
}: Props) {
  const drafts = useMemo(() => calculateAnnualDividendConfirmationDrafts(data, year), [data, year])
  const annualPeriod = useMemo(() => getAnnualPeriod(year), [year])
  const confirmationsByMemberId = useMemo(
    () =>
      new Map(
        data.annualDividendConfirmations
          .filter((record) => record.year === year)
          .map((record) => [record.memberId, record]),
      ),
    [data.annualDividendConfirmations, year],
  )

  async function generateConfirmations() {
    const now = nowIso()
    const records: AnnualDividendConfirmationRecord[] = drafts.map((draft) => {
      const existing = confirmationsByMemberId.get(draft.memberId)

      return {
        id: annualDividendConfirmationRecordId(year, draft.memberId),
        year,
        memberId: draft.memberId,
        payableAmount: draft.payableAmount,
        paidAmount: draft.paidAmount,
        unpaidAmount: draft.unpaidAmount,
        adjustmentAmount: draft.adjustmentAmount,
        status: existing?.status === 'not_generated' || !existing ? 'generated' : existing.status,
        confirmationDate: existing?.confirmationDate,
        note: existing?.note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
    })

    await repository.saveAnnualDividendConfirmations(records)
    await reload()
    notify('年度分红确认单已生成。')
  }

  async function updateStatus(memberId: string, status: AnnualDividendConfirmationStatus) {
    const draft = drafts.find((item) => item.memberId === memberId)

    if (!draft) {
      return
    }

    const existing = confirmationsByMemberId.get(memberId)
    const now = nowIso()
    const record: AnnualDividendConfirmationRecord = {
      id: annualDividendConfirmationRecordId(year, memberId),
      year,
      memberId,
      payableAmount: draft.payableAmount,
      paidAmount: draft.paidAmount,
      unpaidAmount: draft.unpaidAmount,
      adjustmentAmount: draft.adjustmentAmount,
      status,
      confirmationDate:
        status === 'confirmed' || status === 'paid' || status === 'archived'
          ? existing?.confirmationDate ?? todayDate()
          : existing?.confirmationDate,
      note: existing?.note,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await repository.saveAnnualDividendConfirmation(record)
    await reload()
    notify('确认单状态已更新。')
  }

  function exportCsv() {
    downloadTextFile(
      `年度分红确认单-${year}.csv`,
      buildAnnualDividendConfirmationsCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('年度分红确认单报表已导出。')
  }

  async function exportExcel() {
    await exportAnnualDividendConfirmationsXlsx(data, year)
    notify('年度分红确认单美化 Excel 已导出。')
  }

  return (
    <Panel
      title="年度分红确认单"
      description="按公历自然年度生成每个合伙人的确认数据，保留确认状态、日期和备注；已预留后续确认单文件导出能力。"
      actions={
        <div className="row-actions">
          <Button type="button" onClick={exportCsv}>导出 CSV</Button>
          <Button type="button" onClick={exportExcel}>导出美化 Excel</Button>
          <Button type="button" variant="primary" onClick={generateConfirmations}>
            生成/刷新确认单
          </Button>
        </div>
      }
    >
      <div className="summary-grid">
        <div className="summary-item">
          <span>分红年度</span>
          <strong>{year} 年</strong>
          <small>年度周期说明：公历自然年度</small>
        </div>
        <div className="summary-item">
          <span>统计开始日</span>
          <strong>{formatDate(annualPeriod.periodStartDate)}</strong>
          <small>每年 1 月 1 日</small>
        </div>
        <div className="summary-item">
          <span>统计截止日</span>
          <strong>{formatDate(annualPeriod.periodEndDate)}</strong>
          <small>每年 12 月 31 日</small>
        </div>
      </div>

      {drafts.length === 0 ? (
        <EmptyState title="暂无确认数据" description="新增合伙人并锁定月度结算后可生成确认单。" />
      ) : (
        <div className="table-wrap compact-wide-table annual-confirmation-table">
          <table>
            <thead>
              <tr>
                <th>合伙人</th>
                <th className="rate-cell">年化收益率</th>
                <th className="rate-cell">折合月收益率</th>
                <th className="money-cell">年度应分红</th>
                <th className="money-cell">已支付</th>
                <th className="money-cell">待支付</th>
                <th className="number-cell">月度明细</th>
                <th className="money-cell">调整金额</th>
                <th className="status-cell">确认状态</th>
                <th>确认日期</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.memberId}>
                  <td className="strong-cell">{draft.memberName}</td>
                  <td className="rate-cell">{formatRateSummary(draft.partnerAnnualRateSummary)}</td>
                  <td className="rate-cell">{formatRateSummary(draft.partnerMonthlyRateSnapshotSummary)}</td>
                  <td className="money-cell">{formatMoney(draft.payableAmount)}</td>
                  <td className="money-cell">{formatMoney(draft.paidAmount)}</td>
                  <td className="money-cell">{formatMoney(draft.unpaidAmount)}</td>
                  <td className="number-cell">{draft.monthlyDetails.length} 个月</td>
                  <td className="money-cell">{formatMoney(draft.adjustmentAmount)}</td>
                  <td className="status-cell">
                    {draft.status === 'not_generated' ? (
                      <Badge>未生成</Badge>
                    ) : (
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          updateStatus(draft.memberId, event.target.value as AnnualDividendConfirmationStatus)
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{draft.confirmationDate ? formatDate(draft.confirmationDate) : '-'}</td>
                  <td>{draft.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Notice tone="info">
        本系统采用年化单利收益率，按自然月折算；月收益率 = 年化收益率 ÷ 12。月中加入首月按实际计息天数折算，后续月份按整月计算。
      </Notice>
      <Notice tone="info">支付日期可以晚于分红年度，但收益归属年度以统计周期为准。</Notice>
      <Notice tone="info">确认单只记录确认状态，不修改任何已锁定月度结算。</Notice>
    </Panel>
  )
}
