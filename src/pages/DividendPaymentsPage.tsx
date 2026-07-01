import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  annualDividendPaymentBasisLabel,
  annualDividendPaymentPayableAmount,
  annualDividendPaymentUnpaidAmount,
  calculateAnnualSummaryResult,
  getAnnualPeriod,
  normalizeDividendPayment,
} from '../domain/calculation'
import type { AnnualSummaryRow, DividendPayment } from '../domain/types'
import { decimal, isDecimalLike, moneyString } from '../utils/decimal'
import { createId, nowIso, todayDate } from '../utils/date'
import {
  dividendPaymentStatusLabels,
  formatDate,
  formatMoney,
  paymentMethodLabel,
} from '../utils/format'
import { dividendPaymentsFileName } from '../utils/fileName'
import { buildDividendPaymentsCsv, downloadTextFile } from '../storage/exportImport'
import { exportDividendPaymentsXlsx } from '../storage/xlsxReports'
import { Badge, Button, EmptyState, Field, Notice, NumberStepperInput, PageHeader, Panel } from '../components/common'
import type { PageProps } from './pageTypes'

interface PaymentForm {
  memberId: string
  paidAt: string
  amount: string
  paymentMethod: string
  transactionRef: string
  note: string
}

function blankPaymentForm(memberId = '', amount = ''): PaymentForm {
  return {
    memberId,
    paidAt: todayDate(),
    amount,
    paymentMethod: 'bank_transfer',
    transactionRef: '',
    note: '',
  }
}

function paymentStatusText(row: AnnualSummaryRow): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  const payableAmount = annualDividendPaymentPayableAmount(row)
  const unpaidAmount = annualDividendPaymentUnpaidAmount(row)

  if (decimal(payableAmount).lte(0)) {
    return { label: '暂无应付', tone: 'neutral' }
  }

  if (decimal(unpaidAmount).lte(0)) {
    return { label: '已支付', tone: 'success' }
  }

  if (decimal(row.paidAmount).gt(0)) {
    return { label: '部分支付', tone: 'warning' }
  }

  return { label: '未支付', tone: 'warning' }
}

function defaultPaymentAmount(row: AnnualSummaryRow): string {
  const unpaidAmount = annualDividendPaymentUnpaidAmount(row)

  return decimal(unpaidAmount).gt(0) ? unpaidAmount : ''
}

export function DividendPaymentsPage({ data, repository, reload, notify }: PageProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState<PaymentForm>(() => blankPaymentForm())
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')
  const summary = useMemo(() => calculateAnnualSummaryResult(data, year), [data, year])
  const rows = summary.rows
  const membersById = useMemo(
    () => new Map(data.members.map((member) => [member.id, member])),
    [data.members],
  )
  const annualPeriod = useMemo(() => getAnnualPeriod(year), [year])
  const paymentsForYear = data.dividendPayments.filter((payment) => payment.year === year)
  const activePaymentsForYear = paymentsForYear
    .map(normalizeDividendPayment)
    .filter((payment) => payment.status !== 'void')
  const selectedRow = rows.find((row) => row.memberId === form.memberId)
  const totalPayable = rows.reduce((sum, row) => sum.plus(annualDividendPaymentPayableAmount(row)), decimal(0))
  const totalPaid = rows.reduce((sum, row) => sum.plus(row.paidAmount), decimal(0))
  const totalUnpaid = rows.reduce((sum, row) => sum.plus(annualDividendPaymentUnpaidAmount(row)), decimal(0))
  const paidMemberCount = rows.filter(
    (row) =>
      decimal(annualDividendPaymentPayableAmount(row)).gt(0) &&
      decimal(annualDividendPaymentUnpaidAmount(row)).lte(0),
  ).length
  const unpaidMemberCount = rows.filter((row) => decimal(annualDividendPaymentUnpaidAmount(row)).gt(0)).length

  function openPaymentModal(row: AnnualSummaryRow) {
    setForm(blankPaymentForm(row.memberId, defaultPaymentAmount(row)))
    setError('')
    setModalOpen(true)
  }

  function handlePaymentMemberChange(memberId: string) {
    const row = rows.find((item) => item.memberId === memberId)

    setForm((value) => ({
      ...value,
      memberId,
      amount: row ? defaultPaymentAmount(row) : '',
    }))
  }

  function closePaymentModal() {
    setModalOpen(false)
    setError('')
  }

  function exportPaymentsCsv() {
    downloadTextFile(
      dividendPaymentsFileName(year),
      buildDividendPaymentsCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('分红支付记录报表已导出。')
  }

  async function exportPaymentsExcel() {
    await exportDividendPaymentsXlsx(data, year)
    notify('分红支付记录美化 Excel 已导出。')
  }

  async function handlePayment(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    const errors: string[] = []

    if (!form.memberId) {
      errors.push('请选择合伙人。')
    }

    if (!form.paidAt) {
      errors.push('请选择支付日期。')
    }

    if (!isDecimalLike(form.amount) || decimal(form.amount).lte(0)) {
      errors.push('支付金额必须大于 0。')
    }

    if (errors.length > 0) {
      setError(errors.join(' '))
      return
    }

    const selectedUnpaidAmount = selectedRow ? annualDividendPaymentUnpaidAmount(selectedRow) : '0.00'

    if (selectedRow && decimal(form.amount).gt(selectedUnpaidAmount)) {
      const ok = window.confirm('本次支付金额大于该成员待支付金额，确认继续记录？')

      if (!ok) {
        return
      }
    }

    const now = nowIso()
    const paidAmount = moneyString(form.amount.trim())
    const payableAmount = selectedRow ? annualDividendPaymentPayableAmount(selectedRow) : '0.00'
    const unpaidAmount = moneyString(decimal(selectedRow ? annualDividendPaymentUnpaidAmount(selectedRow) : 0).minus(paidAmount))
    const payment: DividendPayment = {
      id: createId('payment'),
      memberId: form.memberId,
      year,
      payableAmount,
      paidAmount,
      unpaidAmount,
      paymentDate: form.paidAt,
      paymentMethod: form.paymentMethod,
      transactionRef: form.transactionRef.trim() || undefined,
      note: form.note.trim(),
      status: 'active',
      paidAt: form.paidAt,
      amount: paidAmount,
      createdAt: now,
      updatedAt: now,
    }

    await repository.saveDividendPayment(payment)
    await reload()
    closePaymentModal()
    notify('年度分红支付已记录。')
  }

  async function voidPayment(payment: DividendPayment) {
    const normalized = normalizeDividendPayment(payment)
    const firstConfirm = window.confirm(`确认取消 ${formatDate(normalized.paymentDate)} 的支付记录？`)

    if (!firstConfirm) {
      return
    }

    const secondConfirm = window.confirm('再次确认：取消后不会删除记录，只会从已支付金额中排除。')

    if (!secondConfirm) {
      return
    }

    await repository.voidDividendPayment(payment.id, '用户取消支付记录')
    await reload()
    notify('支付记录已取消，历史记录已保留。')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="分红支付"
        description="按分红归属年度管理支付记录。支付日期可以晚于分红年度，但不会自动改变归属年度。"
        actions={
          <div className="toolbar-row">
            <Button type="button" onClick={exportPaymentsCsv}>导出 CSV</Button>
            <Button type="button" onClick={exportPaymentsExcel}>导出美化 Excel</Button>
            <NumberStepperInput
              className="compact-input"
              value={year}
              aria-label="分红年度"
              onValueChange={(value) => setYear(Number(value))}
            />
          </div>
        }
      />

      <Panel
        title="分红归属周期"
        description={`${year} 年度分红统计周期为 ${formatDate(annualPeriod.periodStartDate)} 至 ${formatDate(annualPeriod.periodEndDate)}。`}
      >
        <div className="summary-grid">
          <div className="summary-item">
            <span>分红年度</span>
            <strong>{year} 年</strong>
            <small>归属年度不随实际支付日期改变</small>
          </div>
          <div className="summary-item">
            <span>统计开始日</span>
            <strong>{formatDate(annualPeriod.periodStartDate)}</strong>
            <small>公历自然年度</small>
          </div>
          <div className="summary-item">
            <span>统计截止日</span>
            <strong>{formatDate(annualPeriod.periodEndDate)}</strong>
            <small>公历自然年度</small>
          </div>
          <div className="summary-item">
            <span>统计范围</span>
            <strong>已锁定 / 已调整月份</strong>
            <small>草稿月份不进入正式分红</small>
          </div>
        </div>
      </Panel>

      <div className="summary-grid">
        <div className="summary-item">
          <span>年度应付总额</span>
          <strong>{formatMoney(totalPayable.toString())}</strong>
          <small>年度应分红合计</small>
        </div>
        <div className="summary-item">
          <span>已支付总额</span>
          <strong>{formatMoney(totalPaid.toString())}</strong>
          <small>不含已取消支付</small>
        </div>
        <div className="summary-item">
          <span>待支付总额</span>
          <strong className={totalUnpaid.lt(0) ? 'danger-text' : ''}>
            {formatMoney(totalUnpaid.toString())}
          </strong>
          <small>应付总额 - 已支付总额</small>
        </div>
        <div className="summary-item">
          <span>已支付人数</span>
          <strong>{paidMemberCount}</strong>
          <small>待支付小于等于 0 的成员</small>
        </div>
        <div className="summary-item">
          <span>未支付人数</span>
          <strong>{unpaidMemberCount}</strong>
          <small>仍有待支付金额的成员</small>
        </div>
      </div>

      <Panel title="分红支付表" description="金额来自年度汇总，不在此页面修改已锁定月度结算。">
        {rows.length === 0 ? (
          <EmptyState title="暂无分红数据" description="请先完成并锁定月度结算，再记录年度分红支付。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>合伙人</th>
                  <th>分红年度</th>
                  <th>支付口径</th>
                  <th className="money-cell">应付金额</th>
                  <th className="money-cell">已支付</th>
                  <th className="money-cell">待支付</th>
                  <th>最近支付日期</th>
                  <th className="status-cell">支付状态</th>
                  <th className="action-cell">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const memberPayments = activePaymentsForYear
                    .filter((payment) => payment.memberId === row.memberId)
                    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
                  const status = paymentStatusText(row)
                  const payableAmount = annualDividendPaymentPayableAmount(row)
                  const unpaidAmount = annualDividendPaymentUnpaidAmount(row)

                  return (
                    <tr key={row.memberId}>
                      <td className="strong-cell">{row.memberName}</td>
                      <td>{year} 年</td>
                      <td>{annualDividendPaymentBasisLabel(row)}</td>
                      <td className="money-cell">{formatMoney(payableAmount)}</td>
                      <td className="money-cell">{formatMoney(row.paidAmount)}</td>
                      <td className={decimal(unpaidAmount).lt(0) ? 'money-cell danger-text' : 'money-cell strong-number'}>
                        {formatMoney(unpaidAmount)}
                      </td>
                      <td>{memberPayments[0] ? formatDate(memberPayments[0].paymentDate) : '-'}</td>
                      <td className="status-cell"><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td className="action-cell">
                        <Button type="button" variant="primary" onClick={() => openPaymentModal(row)}>
                          记录支付
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="支付记录" description="取消支付不会删除历史记录，只会从已支付金额中排除。">
        {paymentsForYear.length === 0 ? (
          <EmptyState title="暂无支付记录" description="记录支付后会显示在这里。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>支付日期</th>
                  <th>合伙人</th>
                  <th className="status-cell">状态</th>
                  <th className="money-cell">应付金额</th>
                  <th className="money-cell">支付金额</th>
                  <th className="money-cell">未付余额</th>
                  <th>支付方式</th>
                  <th>流水号</th>
                  <th>备注</th>
                  <th className="action-cell">操作</th>
                </tr>
              </thead>
              <tbody>
                {paymentsForYear.map((payment) => {
                  const normalized = normalizeDividendPayment(payment)

                  return (
                    <tr key={payment.id}>
                      <td>{formatDate(normalized.paymentDate)}</td>
                      <td>{membersById.get(payment.memberId)?.name ?? '未知人员'}</td>
                      <td className="status-cell">
                        {normalized.status === 'void' ? (
                          <Badge tone="danger">{dividendPaymentStatusLabels[normalized.status]}</Badge>
                        ) : (
                          <Badge tone="success">{dividendPaymentStatusLabels[normalized.status]}</Badge>
                        )}
                      </td>
                      <td className="money-cell">{formatMoney(normalized.payableAmount)}</td>
                      <td className="money-cell strong-number">{formatMoney(normalized.paidAmount)}</td>
                      <td className="money-cell">{formatMoney(normalized.unpaidAmount)}</td>
                      <td>{paymentMethodLabel(normalized.paymentMethod)}</td>
                      <td>{normalized.transactionRef ?? '-'}</td>
                      <td>{normalized.note || '-'}</td>
                      <td className="action-cell">
                        {normalized.status === 'active' ? (
                          <Button type="button" variant="danger" onClick={() => voidPayment(payment)}>取消</Button>
                        ) : (
                          normalized.voidReason ?? '-'
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

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <div className="modal-header">
              <div>
                <h2 id="payment-modal-title">记录分红支付</h2>
                <p>{selectedRow ? `${selectedRow.memberName} · ${year} 年度分红` : `${year} 年度分红`}</p>
              </div>
              <button type="button" className="icon-button" aria-label="关闭分红支付弹窗" onClick={closePaymentModal}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handlePayment}>
              <div className="modal-body">
                <div className="form-grid">
                  <Field label="合伙人">
                    <select
                      value={form.memberId}
                      onChange={(event) => handlePaymentMemberChange(event.target.value)}
                    >
                      {rows.map((row) => (
                        <option key={row.memberId} value={row.memberId}>
                          {row.memberName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="分红年度">
                    <input value={`${year} 年`} disabled />
                  </Field>
                  <Field label="支付金额">
                    <input
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))}
                      placeholder="例如：10000"
                    />
                  </Field>
                  <Field label="支付日期">
                    <input
                      type="date"
                      value={form.paidAt}
                      onChange={(event) => setForm((value) => ({ ...value, paidAt: event.target.value }))}
                    />
                  </Field>
                  <Field label="支付方式">
                    <select
                      value={form.paymentMethod}
                      onChange={(event) => setForm((value) => ({ ...value, paymentMethod: event.target.value }))}
                    >
                      <option value="bank_transfer">银行转账</option>
                      <option value="cash">现金</option>
                      <option value="wechat">微信</option>
                      <option value="alipay">支付宝</option>
                      <option value="other">其他</option>
                    </select>
                  </Field>
                  <Field label="流水号">
                    <input
                      value={form.transactionRef}
                      onChange={(event) => setForm((value) => ({ ...value, transactionRef: event.target.value }))}
                      placeholder="可选"
                    />
                  </Field>
                  <Field label="备注">
                    <input
                      value={form.note}
                      onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
                      placeholder="可选"
                    />
                  </Field>
                </div>
                {selectedRow ? (
                  <Notice tone="info">
                    当前支付口径：{annualDividendPaymentBasisLabel(selectedRow)}；当前待支付：{formatMoney(annualDividendPaymentUnpaidAmount(selectedRow))}
                  </Notice>
                ) : null}
                {error ? <Notice tone="danger">{error}</Notice> : null}
              </div>
              <div className="modal-footer">
                <Button type="button" onClick={closePaymentModal}>取消</Button>
                <Button type="submit" variant="primary">确认记录</Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}
