import { useMemo, useState } from 'react'
import {
  calculateAnnualSummaryResult,
  calculateCapitalSnapshot,
  getAnnualPeriod,
  isMonthInAnnualPeriod,
  uniqueRateSnapshotSummary,
} from '../domain/calculation'
import { decimal, moneyString } from '../utils/decimal'
import { annualSummaryFileName } from '../utils/fileName'
import {
  adjustmentTypeLabels,
  formatDate,
  formatMoney,
  formatMonth,
  formatRate,
  settlementStatusLabels,
} from '../utils/format'
import { Badge, Button, EmptyState, NumberStepperInput, PageHeader, Panel } from '../components/common'
import { AnnualDividendConfirmation } from '../components/AnnualDividendConfirmation'
import { buildAnnualSummaryCsv, downloadTextFile } from '../storage/exportImport'
import { exportAnnualSummaryXlsx } from '../storage/xlsxReports'
import type { PageProps } from './pageTypes'

function formatRateSummary(value: string): string {
  return value
    ? value
        .split(' | ')
        .filter(Boolean)
        .map((rate) => formatRate(rate))
        .join(' | ')
    : '-'
}

export function AnnualSummaryPage({ data, repository, reload, notify, navigate }: PageProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const summary = useMemo(() => calculateAnnualSummaryResult(data, year), [data, year])
  const rows = summary.rows
  const membersById = useMemo(
    () => new Map(data.members.map((member) => [member.id, member])),
    [data.members],
  )
  const annualPeriod = useMemo(() => getAnnualPeriod(year), [year])
  const finalizedSettlements = data.monthlySettlements.filter(
    (settlement) =>
      (settlement.status === 'locked' || settlement.status === 'adjusted') &&
      isMonthInAnnualPeriod(settlement.month, year),
  )
  const lockedMonthCount = finalizedSettlements.filter((settlement) => settlement.status === 'locked').length
  const adjustedMonthCount = finalizedSettlements.filter((settlement) => settlement.status === 'adjusted').length
  const capitalByMemberId = useMemo(
    () =>
      new Map(
        calculateCapitalSnapshot(data.members, data.capitalTransactions, `${year}-12`).map((row) => [
          row.member.id,
          row.capital,
        ]),
      ),
    [data.capitalTransactions, data.members, year],
  )
  const yearAdjustments = data.adjustmentRecords.filter((record) =>
    isMonthInAnnualPeriod(record.adjustmentMonth, year),
  )
  const partnerAnnualRateSummary = uniqueRateSnapshotSummary(data, year, 'partnerAnnualRate')
  const partnerMonthlyRateSnapshotSummary = uniqueRateSnapshotSummary(
    data,
    year,
    'partnerMonthlyRateSnapshot',
  )
  const annualTheoreticalProfit = moneyString(
    finalizedSettlements.reduce((sum, settlement) => sum.plus(settlement.totalProfit), decimal(0)),
  )
  const annualExternalPayableProfit = moneyString(
    finalizedSettlements.reduce((sum, settlement) => sum.plus(settlement.externalPayableProfit ?? 0), decimal(0)),
  )
  const monthStatusRows = Array.from({ length: 12 }, (_, index) => {
    const monthValue = `${year}-${String(index + 1).padStart(2, '0')}`
    const settlement = data.monthlySettlements.find((item) => item.month === monthValue)

    return {
      month: monthValue,
      label: `${index + 1} 月`,
      status: settlement?.status,
    }
  })

  function exportAnnualCsv() {
    downloadTextFile(
      annualSummaryFileName(year),
      buildAnnualSummaryCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('年度汇总报表已导出。')
  }

  async function exportAnnualExcel() {
    await exportAnnualSummaryXlsx(data, year)
    notify('年度汇总美化 Excel 已导出。')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="年度汇总"
        description="只统计已锁定 / 已调整月份，展示年度应分红、已支付和待支付。支付录入统一在分红支付模块处理。"
        actions={
          <div className="toolbar-row">
            <Button type="button" onClick={exportAnnualCsv}>导出 CSV</Button>
            <Button type="button" onClick={exportAnnualExcel}>导出美化 Excel</Button>
            <Button type="button" onClick={() => navigate('dividendPayments')}>进入分红支付</Button>
            <NumberStepperInput
              className="compact-input"
              value={year}
              aria-label="汇总年份"
              onValueChange={(value) => setYear(Number(value))}
            />
          </div>
        }
      />

      <Panel
        title="年度周期"
        description={`本系统年度周期采用公历自然年度。当前统计周期为：${year}年1月1日 至 ${year}年12月31日。年度汇总仅统计该年度内已锁定 / 已调整月份。`}
      >
        <div className="summary-grid">
          <div className="summary-item">
            <span>分红年度</span>
            <strong>{year} 年</strong>
            <small>公历自然年度</small>
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
          <div className="summary-item">
            <span>已锁定月份数量</span>
            <strong>{lockedMonthCount}</strong>
            <small>仅统计 {year} 年 1 月至 12 月</small>
          </div>
          <div className="summary-item">
            <span>已调整月份数量</span>
            <strong>{adjustedMonthCount}</strong>
            <small>仅统计 {year} 年 1 月至 12 月</small>
          </div>
        </div>
      </Panel>

      <Panel
        title={`${year} 年分红汇总`}
        description={`已锁定或已调整月份：${finalizedSettlements.length} 个。草稿月份不会进入年度汇总。当前支持报表导出，已预留表格和确认单扩展能力。`}
      >
        <div className="summary-grid">
          <div className="summary-item">
            <span>年度理论总收益</span>
            <strong>{formatMoney(annualTheoreticalProfit)}</strong>
            <small>该年度已锁定 / 已调整月份理论收益合计</small>
          </div>
          <div className="summary-item">
            <span>年度对外应付收益</span>
            <strong>{formatMoney(annualExternalPayableProfit)}</strong>
            <small>非负责人应付收益合计</small>
          </div>
          <div className="summary-item">
            <span>普通合伙人年化收益率</span>
            <strong>{formatRateSummary(partnerAnnualRateSummary)}</strong>
            <small>对外年化单利口径</small>
          </div>
          <div className="summary-item">
            <span>折合月收益率</span>
            <strong>{formatRateSummary(partnerMonthlyRateSnapshotSummary)}</strong>
            <small>年化收益率 ÷ 12</small>
          </div>
          <div className="summary-item">
            <span>全年外部资金差额留存</span>
            <strong>{formatMoney(summary.retainedProfit)}</strong>
            <small>仅基于非负责人折算本金，且不分配给个人</small>
          </div>
          <div className="summary-item">
            <span>年度尾差调整</span>
            <strong>{formatMoney(summary.roundingAdjustmentAmount)}</strong>
            <small>默认归负责人承担或享有</small>
          </div>
          <div className="summary-item">
            <span>负责人年度理论收益</span>
            <strong>{formatMoney(summary.managerTheoreticalProfit)}</strong>
            <small>已锁定月份负责人理论分配收益合计，含尾差调整</small>
          </div>
          <div className="summary-item">
            <span>负责人年度实际净收益</span>
            <strong>{formatMoney(summary.managerActualNetProfit)}</strong>
            <small>已录入实际收入的锁定月份合计</small>
          </div>
          <div className="summary-item">
            <span>年度实际差额</span>
            <strong className={decimal(summary.managerNetDiff).lt(0) ? 'danger-text' : ''}>
              {formatMoney(summary.managerNetDiff)}
            </strong>
            <small>实际净收益 - 理论收益</small>
          </div>
          <div className="summary-item">
            <span>年度调整金额</span>
            <strong className={decimal(summary.annualAdjustmentAmount).lt(0) ? 'danger-text' : ''}>
              {formatMoney(summary.annualAdjustmentAmount)}
            </strong>
            <small>按调整入账月份统计，单独展示</small>
          </div>
          <div className="summary-item">
            <span>未归属调整</span>
            <strong>{formatMoney(summary.unassignedAdjustmentAmount)}</strong>
            <small>不归属个人的公司级或说明类调整</small>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="暂无年度数据" description="锁定月度结算后，这里会自动汇总。" />
        ) : (
          <div className="table-wrap compact-wide-table annual-summary-table">
            <table>
              <thead>
                <tr>
                  <th>合伙人</th>
                  <th className="status-cell">角色</th>
                  <th className="money-cell">年末本金</th>
                  <th className="money-cell">全年普通分红</th>
                  <th className="money-cell">全年负责人收益</th>
                  <th className="money-cell">年度实际净收益</th>
                  <th className="money-cell">调整金额</th>
                  <th className="money-cell">全年应分红</th>
                  <th className="money-cell">已支付</th>
                  <th className="money-cell">待支付</th>
                  <th className="status-cell">支付状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isPaid = decimal(row.totalDividend).gt(0) && decimal(row.unpaidAmount).lte(0)
                  const isPartial = decimal(row.paidAmount).gt(0) && decimal(row.unpaidAmount).gt(0)

                  return (
                    <tr key={row.memberId}>
                      <td className="strong-cell">{row.memberName}</td>
                      <td className="status-cell">{row.memberRole === 'manager' ? <Badge tone="accent">负责人</Badge> : '合伙人'}</td>
                      <td className="money-cell">{formatMoney(capitalByMemberId.get(row.memberId) ?? '0')}</td>
                      <td className="money-cell">{formatMoney(row.partnerProfit)}</td>
                      <td className="money-cell">{formatMoney(row.managerProfit)}</td>
                      <td className="money-cell">{formatMoney(row.actualNetProfit)}</td>
                      <td className={decimal(row.adjustmentAmount).lt(0) ? 'money-cell danger-text' : 'money-cell'}>
                        {formatMoney(row.adjustmentAmount)}
                      </td>
                      <td className="money-cell strong-number">{formatMoney(row.totalDividend)}</td>
                      <td className="money-cell">{formatMoney(row.paidAmount)}</td>
                      <td className={decimal(row.unpaidAmount).lt(0) ? 'money-cell danger-text' : 'money-cell strong-number'}>
                        {formatMoney(row.unpaidAmount)}
                      </td>
                      <td className="status-cell">
                        {isPaid ? (
                          <Badge tone="success">已支付</Badge>
                        ) : isPartial ? (
                          <Badge tone="warning">部分支付</Badge>
                        ) : (
                          <Badge tone="warning">未支付</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="月份状态表" description="年度汇总只统计已锁定 / 已调整月份；草稿和未创建月份不进入正式分红。">
        <div className="month-status-grid">
          {monthStatusRows.map((row) => {
            const statusLabel = row.status ? settlementStatusLabels[row.status] : '未创建'
            const tone = row.status === 'locked'
              ? 'success'
              : row.status === 'adjusted'
                ? 'accent'
                : row.status === 'draft'
                  ? 'warning'
                  : 'neutral'

            return (
              <div key={row.month} className="month-status-item">
                <strong>{row.label}</strong>
                <Badge tone={tone}>{statusLabel}</Badge>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="导出区" description="导出文件仅用于人工核对和归档，不改变业务数据。">
        <div className="toolbar-row">
          <Button type="button" onClick={exportAnnualCsv}>导出 CSV</Button>
          <Button type="button" onClick={exportAnnualExcel}>导出美化 Excel</Button>
          <Button type="button" onClick={() => navigate('memberDetail')}>
            进入合伙人个人明细
          </Button>
          <Button type="button" variant="primary" onClick={() => navigate('dividendPayments')}>
            进入分红支付
          </Button>
        </div>
      </Panel>

      <AnnualDividendConfirmation
        data={data}
        year={year}
        repository={repository}
        reload={reload}
        notify={notify}
      />

      <Panel title="年度调整明细" description="调整记录不覆盖原始已锁定结算，年度汇总按调整入账月份统计。">
        {yearAdjustments.length === 0 ? (
          <EmptyState title="暂无调整记录" description="锁定月份如有修正，会在月度结算页新增调整记录并显示到这里。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>目标月份</th>
                  <th>调整月份</th>
                  <th>归属成员</th>
                  <th>类型</th>
                  <th className="money-cell">金额</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {yearAdjustments.map((record) => (
                  <tr key={record.id}>
                    <td>{formatMonth(record.targetMonth)}</td>
                    <td>{formatMonth(record.adjustmentMonth)}</td>
                    <td>
                      {record.memberId
                        ? membersById.get(record.memberId)?.name ?? '未知成员'
                        : '不归属个人'}
                    </td>
                    <td>{adjustmentTypeLabels[record.type]}</td>
                    <td className={decimal(record.amount).lt(0) ? 'money-cell danger-text' : 'money-cell strong-number'}>
                      {formatMoney(record.amount)}
                    </td>
                    <td>{record.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
