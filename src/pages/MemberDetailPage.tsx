import { useMemo, useState } from 'react'
import { calculateMemberAnnualDetail } from '../domain/calculation'
import { decimal } from '../utils/decimal'
import { memberAnnualDetailFileName, memberDividendSlipFileName } from '../utils/fileName'
import {
  adjustmentTypeLabels,
  capitalLotStatusLabels,
  formatDate,
  formatMoney,
  formatMonth,
  formatRate,
  memberStatusLabels,
  prorationTypeLabels,
} from '../utils/format'
import {
  buildMemberAnnualDetailCsv,
  buildMemberDividendSlipCsv,
  downloadTextFile,
} from '../storage/exportImport'
import {
  exportMemberAnnualDetailXlsx,
  exportMemberDividendSlipXlsx,
} from '../storage/xlsxReports'
import { Badge, Button, EmptyState, Field, Notice, NumberStepperInput, PageHeader, Panel } from '../components/common'
import type { PageProps } from './pageTypes'

export function MemberDetailPage({ data, notify }: PageProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [memberId, setMemberId] = useState(data.members[0]?.id ?? '')
  const selectedMemberId = memberId || (data.members[0]?.id ?? '')
  const detail = useMemo(
    () => selectedMemberId ? calculateMemberAnnualDetail(data, selectedMemberId, year) : undefined,
    [data, selectedMemberId, year],
  )

  function exportCsv() {
    if (!selectedMemberId || !detail) {
      return
    }

    downloadTextFile(
      memberAnnualDetailFileName(detail.member.name, year),
      buildMemberAnnualDetailCsv(data, selectedMemberId, year),
      'text/csv;charset=utf-8',
    )
    notify('合伙人个人年度明细报表已导出。')
  }

  async function exportExcel() {
    if (!selectedMemberId || !detail) {
      return
    }

    await exportMemberAnnualDetailXlsx(data, selectedMemberId, year)
    notify('合伙人个人年度明细美化 Excel 已导出。')
  }

  function exportDividendSlipCsv() {
    if (!selectedMemberId || !detail) {
      return
    }

    downloadTextFile(
      memberDividendSlipFileName(detail.member.name, year),
      buildMemberDividendSlipCsv(data, selectedMemberId, year),
      'text/csv;charset=utf-8',
    )
    notify('合伙人个人分红条已导出。')
  }

  async function exportDividendSlipExcel() {
    if (!selectedMemberId || !detail) {
      return
    }

    await exportMemberDividendSlipXlsx(data, selectedMemberId, year)
    notify('合伙人个人分红条美化 Excel 已导出。')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="合伙人个人明细"
        description="按合伙人和年份核对本金批次、月度收益、调整记录、已支付和待支付。此页只读，不修改已锁定历史数据。"
        actions={
          <div className="toolbar-row">
            <Button type="button" variant="primary" onClick={exportDividendSlipCsv} disabled={!detail}>
              分红条 CSV
            </Button>
            <Button type="button" variant="primary" onClick={exportDividendSlipExcel} disabled={!detail}>
              分红条 Excel
            </Button>
            <Button type="button" onClick={exportCsv} disabled={!detail}>明细 CSV</Button>
            <Button type="button" onClick={exportExcel} disabled={!detail}>明细 Excel</Button>
            <NumberStepperInput
              className="compact-input"
              value={year}
              aria-label="明细年份"
              onValueChange={(value) => setYear(Number(value))}
            />
          </div>
        }
      />

      {data.members.length === 0 || !detail ? (
        <EmptyState title="暂无合伙人" description="先在合伙人管理页新增合伙人。" />
      ) : (
        <>
          <Panel title="筛选与基本信息" description="月度收益只读取已锁定或已调整月份，调整记录按调整入账年份统计。">
            <div className="form-grid">
              <Field label="合伙人">
                <select value={selectedMemberId} onChange={(event) => setMemberId(event.target.value)}>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="summary-grid">
              <div className="summary-item">
                <span>合伙人</span>
                <strong>{detail.member.name}</strong>
                <small>{detail.member.note || '无备注'}</small>
              </div>
              <div className="summary-item">
                <span>角色</span>
                <strong>{detail.member.role === 'manager' ? '负责人' : '合伙人'}</strong>
                <small>{memberStatusLabels[detail.member.status]}</small>
              </div>
              <div className="summary-item">
                <span>当前有效本金</span>
                <strong>{formatMoney(detail.currentCapital)}</strong>
                <small>截至所选年份 12 月</small>
              </div>
              <div className="summary-item">
                <span>年度累计收益</span>
                <strong>{formatMoney(detail.totalDividend)}</strong>
                <small>已锁定或已调整月份 + 调整金额</small>
              </div>
              <div className="summary-item">
                <span>已支付</span>
                <strong>{formatMoney(detail.paidAmount)}</strong>
                <small>不含已取消支付</small>
              </div>
              <div className="summary-item">
                <span>待支付</span>
                <strong className={decimal(detail.unpaidAmount).lt(0) ? 'danger-text' : ''}>
                  {formatMoney(detail.unpaidAmount)}
                </strong>
                <small>应分红 - 已支付</small>
              </div>
            </div>
          </Panel>

          <Panel title="资金批次">
            {detail.capitalLots.length === 0 ? (
              <EmptyState title="暂无资金批次" description="入金或正向资金调整会形成资金批次。" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>起息日期</th>
                      <th className="money-cell">金额</th>
                      <th className="status-cell">状态</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.capitalLots.map((lot) => (
                      <tr key={lot.id}>
                        <td>{formatDate(lot.startDate)}</td>
                        <td className="money-cell strong-number">{formatMoney(lot.amount)}</td>
                        <td className="status-cell">{lot.status === 'active' ? <Badge tone="success">{capitalLotStatusLabels[lot.status]}</Badge> : <Badge>{capitalLotStatusLabels[lot.status]}</Badge>}</td>
                        <td>{lot.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="月度收益明细">
            {detail.monthlyDetails.length === 0 ? (
              <EmptyState title="暂无月度收益" description="锁定月度结算后会显示到这里。" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th className="rate-cell">年化收益率</th>
                      <th className="rate-cell">折合月收益率</th>
                      <th>计息方式</th>
                      <th className="number-cell">计息天数</th>
                      <th className="money-cell">普通收益</th>
                      <th className="money-cell">负责人收益</th>
                      <th className="money-cell">当月应分红</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.monthlyDetails.map((row) => (
                      <tr key={row.month}>
                        <td>{formatMonth(row.month)}</td>
                        <td className="rate-cell">{formatRate(row.partnerAnnualRate)}</td>
                        <td className="rate-cell">{formatRate(row.partnerMonthlyRateSnapshot)}</td>
                        <td>{prorationTypeLabels[row.prorationType]}</td>
                        <td className="number-cell">{row.interestDays}/{row.daysInMonth}</td>
                        <td className="money-cell">{formatMoney(row.partnerProfit)}</td>
                        <td className="money-cell">{formatMoney(row.managerProfit)}</td>
                        <td className="money-cell strong-number">{formatMoney(row.totalDividend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="调整记录">
            {detail.adjustments.length === 0 ? (
              <EmptyState title="暂无调整记录" description="已锁定月份的修正会以调整记录方式进入个人明细。" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>目标月份</th>
                      <th>调整月份</th>
                      <th>类型</th>
                      <th className="money-cell">金额</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.adjustments.map((record) => (
                      <tr key={record.id}>
                        <td>{formatMonth(record.targetMonth)}</td>
                        <td>{formatMonth(record.adjustmentMonth)}</td>
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

          <Notice tone="info">个人明细页不提供修改已锁定历史数据的入口；修正请在月度结算页新增调整记录。</Notice>
        </>
      )}
    </div>
  )
}
