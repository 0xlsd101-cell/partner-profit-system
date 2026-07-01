import { useEffect, useMemo, useState } from 'react'
import {
  allocationRecordId,
  buildStoredMonthlyCalculationResult,
  calculateMonthlySettlement,
  canEditMonthlySettlement,
  daysInNaturalMonth,
  getAnnualPeriod,
  hasNegativeManagerActualNetProfit,
  isActualIncomeDiffLarge,
  settlementRecordId,
} from '../domain/calculation'
import type {
  AdjustmentRecord,
  AdjustmentRecordType,
  AllocationMode,
  MonthlyAllocation,
  MonthlySettlement,
  RetainedProfitHandling,
} from '../domain/types'
import { validateSettlementInput } from '../domain/validation'
import { decimal, isDecimalLike, moneyString } from '../utils/decimal'
import { createId, currentMonth, nowIso } from '../utils/date'
import {
  formatMoney,
  formatDate,
  formatMonth,
  formatRate,
  formatRatio,
  percentInputToRate,
  rateToPercentInput,
  roundingAdjustmentTargetLabels,
} from '../utils/format'
import { monthlySettlementFileName } from '../utils/fileName'
import { Badge, Button, EmptyState, Field, Notice, PageHeader, Panel } from '../components/common'
import { buildMonthlySettlementCsv, downloadTextFile } from '../storage/exportImport'
import { exportMonthlySettlementXlsx } from '../storage/xlsxReports'
import type { PageProps } from './pageTypes'

const retainedHandlingLabels: Record<RetainedProfitHandling, string> = {
  company_retained: '公司留存',
  risk_reserve: '风险准备金',
  pending_distribution: '待后续分配',
  other: '其他',
}

const adjustmentTypeLabels: Record<AdjustmentRecordType, string> = {
  capital_adjustment: '本金调整',
  profit_adjustment: '收益调整',
  income_adjustment: '实际收入调整',
  note_adjustment: '备注调整',
}

function blankAdjustmentForm(targetMonth: string) {
  return {
    targetMonth,
    adjustmentMonth: currentMonth(),
    memberId: '',
    type: 'profit_adjustment' as AdjustmentRecordType,
    amount: '0',
    reason: '',
  }
}

function retainedHandlingText(value: RetainedProfitHandling | ''): string {
  return value ? retainedHandlingLabels[value] : '未选择'
}

function formatOptionalMoney(value?: string): string {
  return value ? formatMoney(value) : '-'
}

function prorationTypeText(value: MonthlyAllocation['prorationType']): string {
  if (value === 'first_month_prorated') {
    return '首月折算'
  }

  if (value === 'not_started') {
    return '未起息'
  }

  return '整月计息'
}

function allocationDisplayProfit(
  allocation: Pick<MonthlyAllocation, 'memberRole' | 'managerOwnCapitalProfit' | 'partnerProfit'>,
): string {
  return allocation.memberRole === 'manager'
    ? allocation.managerOwnCapitalProfit
    : allocation.partnerProfit
}

type RiskMessage = {
  tone: 'info' | 'warning' | 'danger' | 'success'
  text: string
}

export function MonthlySettlementPage({ data, repository, reload, notify }: PageProps) {
  const [month, setMonth] = useState(currentMonth())
  const [allocationMode, setAllocationMode] = useState<AllocationMode>('auto_partner_rate')
  const [totalRatePercent, setTotalRatePercent] = useState('2.5')
  const [managerRatePercent, setManagerRatePercent] = useState('2.0')
  const [partnerAnnualRatePercent, setPartnerAnnualRatePercent] = useState('6.0')
  const [retainedHandling, setRetainedHandling] = useState<RetainedProfitHandling | ''>('')
  const [actualDistributableNetIncome, setActualDistributableNetIncome] = useState('')
  const [actualIncomeNote, setActualIncomeNote] = useState('')
  const [note, setNote] = useState('')
  const [adjustmentForm, setAdjustmentForm] = useState(() => blankAdjustmentForm(month))
  const [error, setError] = useState('')
  const existing = data.monthlySettlements.find((settlement) => settlement.month === month)
  const canEdit = canEditMonthlySettlement(existing)
  const isLocked = !canEdit
  const monthAdjustments = data.adjustmentRecords.filter((record) => record.targetMonth === month)

  useEffect(() => {
    if (existing) {
      setAllocationMode(existing.allocationMode)
      setTotalRatePercent(rateToPercentInput(existing.totalRate))
      setManagerRatePercent(rateToPercentInput(existing.managerRate))
      setPartnerAnnualRatePercent(rateToPercentInput(existing.partnerAnnualRate))
      setRetainedHandling(existing.retainedHandling)
      setActualDistributableNetIncome(
        existing.actualDistributableNetIncome ?? existing.actualDistributableIncome ?? '',
      )
      setActualIncomeNote(existing.actualIncomeNote ?? '')
      setNote(existing.note)
    } else {
      setAllocationMode('auto_partner_rate')
      setTotalRatePercent('2.5')
      setManagerRatePercent('2.0')
      setPartnerAnnualRatePercent('6.0')
      setRetainedHandling('')
      setActualDistributableNetIncome('')
      setActualIncomeNote('')
      setNote('')
    }
    setAdjustmentForm(blankAdjustmentForm(month))
    setError('')
  }, [existing, month])

  const calculation = useMemo(() => {
    try {
      const rateInputsValid =
        isDecimalLike(totalRatePercent) &&
        isDecimalLike(managerRatePercent) &&
        isDecimalLike(partnerAnnualRatePercent) &&
        (!actualDistributableNetIncome.trim() || isDecimalLike(actualDistributableNetIncome))

      if (!rateInputsValid) {
        return '收益率或实际收入必须是有效数字。'
      }

      if (isLocked && existing) {
        return buildStoredMonthlyCalculationResult(
          existing,
          data.monthlyAllocations.filter((allocation) => allocation.settlementId === existing.id),
        )
      }

      return calculateMonthlySettlement({
        members: data.members,
        capitalLots: data.capitalLots,
        capitalTransactions: data.capitalTransactions,
        month,
        allocationMode,
        totalRate: percentInputToRate(totalRatePercent),
        managerRate: percentInputToRate(managerRatePercent),
        partnerAnnualRate: percentInputToRate(partnerAnnualRatePercent),
        retainedHandling,
        actualDistributableNetIncome,
        actualIncomeNote,
        actualReconciliationStatus: actualDistributableNetIncome.trim() ? 'draft' : 'not_entered',
        settlementId: settlementRecordId(month),
      })
    } catch (err) {
      return err instanceof Error ? err.message : '收益率或实际收入输入无效。'
    }
  }, [
    allocationMode,
    actualDistributableNetIncome,
    actualIncomeNote,
    data.capitalTransactions,
    data.capitalLots,
    data.members,
    data.monthlyAllocations,
    existing,
    isLocked,
    managerRatePercent,
    month,
    partnerAnnualRatePercent,
    retainedHandling,
    totalRatePercent,
  ])

  const draftValidationErrors =
    typeof calculation === 'string' ? [calculation] : validateSettlementInput(calculation, 'draft')
  const lockValidationErrors =
    typeof calculation === 'string' ? [calculation] : validateSettlementInput(calculation, 'locked')
  const visibleValidationErrors =
    draftValidationErrors.length > 0 ? draftValidationErrors : lockValidationErrors

  function buildRecords(status: MonthlySettlement['status']) {
    if (typeof calculation === 'string') {
      throw new Error(calculation)
    }

    const now = nowIso()
    const settlementId = settlementRecordId(month)
    const shouldKeepRetainedHandling = decimal(calculation.settlement.retainedRate).gt(0)
    const actualReconciliationStatus = actualDistributableNetIncome.trim()
      ? status === 'locked'
        ? 'confirmed'
        : 'draft'
      : 'not_entered'
    const settlement: MonthlySettlement = {
      ...calculation.settlement,
      id: settlementId,
      status,
      retainedHandling: shouldKeepRetainedHandling ? retainedHandling : '',
      actualReconciliationStatus,
      actualIncomeNote: actualIncomeNote.trim() || undefined,
      note: note.trim(),
      lockedAt: status === 'locked' ? existing?.lockedAt ?? now : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const allocations: MonthlyAllocation[] = calculation.allocations.map((allocation) => ({
      ...allocation,
      id: allocationRecordId(month, allocation.memberId, allocation.capitalLotId),
      settlementId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }))

    return { settlement, allocations }
  }

  async function save(status: MonthlySettlement['status']) {
    setError('')

    if (isLocked) {
      setError('该月份已锁定或已调整，不能直接修改，请新增调整记录。')
      return
    }

    if (typeof calculation === 'string') {
      setError(calculation)
      return
    }

    const errors = validateSettlementInput(calculation, status)

    if (errors.length > 0) {
      setError(errors.join(' '))
      return
    }

    if (status === 'locked') {
      const ok = window.confirm(`确认锁定 ${formatMonth(month)}？锁定后页面不允许直接修改该月结算。`)

      if (!ok) {
        return
      }
    }

    const { settlement, allocations } = buildRecords(status)
    await repository.saveMonthlySettlementWithAllocations(settlement, allocations)
    await reload()
    notify(status === 'locked' ? '月度结算已确认并锁定。' : '月度结算草稿已保存。')
  }

  function exportMonthlyCsv() {
    const reportYear = Number(month.slice(0, 4))

    downloadTextFile(
      monthlySettlementFileName(reportYear),
      buildMonthlySettlementCsv(data, reportYear),
      'text/csv;charset=utf-8',
    )
    notify('月度结算明细报表已导出。')
  }

  async function exportMonthlyExcel() {
    await exportMonthlySettlementXlsx(data, month)
    notify('月度结算美化 Excel 已导出。')
  }

  async function saveAdjustment(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!existing || !isLocked) {
      setError('只能为已锁定月份新增调整记录。')
      return
    }

    if (!isDecimalLike(adjustmentForm.amount)) {
      setError('调整金额必须是有效数字。')
      return
    }

    if (adjustmentForm.type !== 'note_adjustment' && decimal(adjustmentForm.amount).isZero()) {
      setError('非备注调整金额不能为 0。')
      return
    }

    if (!adjustmentForm.reason.trim()) {
      setError('调整记录必须填写原因。')
      return
    }

    const now = nowIso()
    const record: AdjustmentRecord = {
      id: createId('adjustment'),
      targetMonth: month,
      adjustmentMonth: adjustmentForm.adjustmentMonth,
      memberId: adjustmentForm.memberId || undefined,
      type: adjustmentForm.type,
      amount: adjustmentForm.amount.trim(),
      reason: adjustmentForm.reason.trim(),
      createdAt: now,
      updatedAt: now,
    }

    await repository.saveAdjustmentRecord(record)
    await reload()
    setAdjustmentForm(blankAdjustmentForm(month))
    notify('调整记录已新增，原锁定结算未被覆盖。')
  }

  const displayedManagerRatePercent =
    typeof calculation !== 'string' && allocationMode === 'auto_partner_rate'
      ? rateToPercentInput(calculation.settlement.managerRate)
      : managerRatePercent
  const displayedPartnerMonthlyRatePercent =
    typeof calculation !== 'string'
      ? rateToPercentInput(calculation.settlement.partnerMonthlyRateSnapshot)
      : ''
  const hasNegativeManagerRate =
    typeof calculation !== 'string' && decimal(calculation.settlement.managerRate).lt(0)
  const hasPositiveRetainedRate =
    typeof calculation !== 'string' && decimal(calculation.settlement.retainedRate).gt(0)
  const hasNegativeRetainedRate =
    typeof calculation !== 'string' && decimal(calculation.settlement.retainedRate).lt(0)
  const actualIncomeNotEntered =
    typeof calculation !== 'string' && calculation.settlement.actualReconciliationStatus === 'not_entered'
  const managerActualNetProfitIsNegative =
    typeof calculation !== 'string' && hasNegativeManagerActualNetProfit(calculation.settlement)
  const actualIncomeDiffIsLarge =
    typeof calculation !== 'string' && isActualIncomeDiffLarge(calculation.settlement)
  const settlementYear = Number(month.slice(0, 4))
  const annualPeriod = getAnnualPeriod(settlementYear)
  const managerOwnCapitalProfit =
    typeof calculation === 'string'
      ? '0.00'
      : moneyString(
          calculation.allocations.reduce(
            (sum, allocation) => sum.plus(allocation.managerOwnCapitalProfit ?? 0),
            decimal(0),
          ),
        )
  const settlementStatusLabel = existing?.status === 'adjusted'
    ? '已调整'
    : isLocked
      ? '已锁定'
      : existing
        ? '草稿'
        : '未保存'
  const settlementStatusTone: 'accent' | 'success' | 'warning' | 'neutral' = existing?.status === 'adjusted'
    ? 'accent'
    : isLocked
      ? 'success'
      : existing
        ? 'warning'
        : 'neutral'
  const riskMessages: RiskMessage[] =
    typeof calculation === 'string'
      ? [{ tone: 'danger', text: calculation }]
      : [
          hasNegativeManagerRate
            ? {
                tone: 'danger',
                text: '本月总收益率低于普通合伙人折合月收益率，负责人专项月收益率为负，禁止确认锁定。',
              }
            : undefined,
          managerActualNetProfitIsNegative
            ? {
                tone: 'danger',
                text: '本月实际可分配净收入不足以覆盖对外合伙人应付收益，负责人实际净收益为负数。',
              }
            : undefined,
          isLocked
            ? {
                tone: 'warning',
                text: '已锁定或已调整月份不可直接修改，请通过调整记录处理。',
              }
            : undefined,
          decimal(calculation.settlement.roundingAdjustmentAmount).isZero()
            ? undefined
            : {
                tone: 'info',
                text: `尾差调整为 ${formatMoney(calculation.settlement.roundingAdjustmentAmount)}，尾差归属：${roundingAdjustmentTargetLabels[calculation.settlement.roundingAdjustmentTarget]}。`,
              },
        ].filter((item): item is RiskMessage => Boolean(item))

  return (
    <div className="page-stack">
      <PageHeader
        title="月度结算"
        description="支持三收益率录入、外部资金差额留存处理，并记录本月实际可分配收入对账。"
        actions={
          <div className="toolbar-row">
            <Button
              type="button"
              onClick={() => save('draft')}
              disabled={isLocked || draftValidationErrors.length > 0}
            >
              保存草稿
            </Button>
            <Button type="button" onClick={exportMonthlyCsv}>导出 CSV</Button>
            <Button type="button" onClick={exportMonthlyExcel}>导出美化 Excel</Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => save('locked')}
              disabled={isLocked || lockValidationErrors.length > 0}
            >
              确认并锁定
            </Button>
          </div>
        }
      />

      <Panel title="结算概览" description={`年度周期：${settlementYear}年1月1日 至 ${settlementYear}年12月31日。`}>
        <div className="summary-grid">
          <div className="summary-item">
            <span>结算月份</span>
            <strong>{formatMonth(month)}</strong>
            <small>按自然月结算</small>
          </div>
          <div className="summary-item">
            <span>结算状态</span>
            <strong><Badge tone={settlementStatusTone}>{settlementStatusLabel}</Badge></strong>
            <small>已锁定或已调整月份不可直接修改</small>
          </div>
          <div className="summary-item">
            <span>当月天数</span>
            <strong>{daysInNaturalMonth(month)} 天</strong>
            <small>月中加入首月按天折算</small>
          </div>
          <div className="summary-item">
            <span>年度周期说明</span>
            <strong>公历自然年度</strong>
            <small>{formatDate(annualPeriod.periodStartDate)} 至 {formatDate(annualPeriod.periodEndDate)}</small>
          </div>
        </div>
      </Panel>

      <Panel
        title="收益率设置"
        description="普通合伙人对外输入年化单利收益率；系统内部按年化收益率 ÷ 12 保存折合月收益率快照。"
        actions={
          existing?.status === 'adjusted' ? (
            <Badge tone="accent">已调整</Badge>
          ) : isLocked ? (
            <Badge tone="success">已锁定</Badge>
          ) : existing ? (
            <Badge tone="warning">草稿</Badge>
          ) : (
            <Badge>未保存</Badge>
          )
        }
      >
        <div className="form-grid form-grid-wide">
          <Field label="结算月份">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              onInput={(event) => setMonth(event.currentTarget.value)}
            />
          </Field>
          <Field label="分配模式">
            <select
              value={allocationMode}
              disabled={isLocked}
              onChange={(event) => setAllocationMode(event.target.value as AllocationMode)}
            >
              <option value="auto_partner_rate">按年化普通收益率自动计算负责人月率</option>
              <option value="manual_all_rates">总月率、负责人月率、普通年化率手动录入</option>
            </select>
          </Field>
          <Field label="月总收益率（%）" hint="默认建议 2.5">
            <input
              inputMode="decimal"
              value={totalRatePercent}
              disabled={isLocked}
              onChange={(event) => setTotalRatePercent(event.target.value)}
            />
          </Field>
          <Field
            label="负责人专项月收益率快照（%）"
            hint={allocationMode === 'auto_partner_rate' ? '自动：月总收益率 - 普通折合月率' : '手动录入月率'}
          >
            <input
              inputMode="decimal"
              value={displayedManagerRatePercent}
              disabled={isLocked || allocationMode === 'auto_partner_rate'}
              onChange={(event) => setManagerRatePercent(event.target.value)}
            />
          </Field>
          <Field
            label="普通合伙人年化收益率（%）"
            hint="年化单利口径，对外展示；内部月收益率 = 年化收益率 ÷ 12"
          >
            <input
              inputMode="decimal"
              value={partnerAnnualRatePercent}
              disabled={isLocked}
              onChange={(event) => setPartnerAnnualRatePercent(event.target.value)}
            />
          </Field>
          <Field label="折合月收益率快照（%）" hint="年化单利，月收益率 = 年化收益率 ÷ 12">
            <input value={displayedPartnerMonthlyRatePercent} disabled />
          </Field>
          <Field label="外部资金差额留存处理方式" hint="有正差额时锁定前必填">
            <select
              value={retainedHandling}
              disabled={isLocked || !hasPositiveRetainedRate}
              onChange={(event) => setRetainedHandling(event.target.value as RetainedProfitHandling | '')}
            >
              <option value="">请选择</option>
              <option value="company_retained">公司留存</option>
              <option value="risk_reserve">风险准备金</option>
              <option value="pending_distribution">待后续分配</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="备注">
            <input
              value={note}
              disabled={isLocked}
              onChange={(event) => setNote(event.target.value)}
              placeholder="可选"
            />
          </Field>
        </div>

        {isLocked ? <Notice tone="warning">该月份已锁定或已调整，页面展示的是已保存结算结果，不会按当前资金流水重新计算。</Notice> : null}
        {hasNegativeManagerRate ? <Notice tone="danger">月总收益率低于普通合伙人折合月收益率，负责人专项月收益率为负，禁止确认锁定。</Notice> : null}
        {hasNegativeRetainedRate ? <Notice tone="danger">当前为超分配状态，可以保存草稿，但禁止确认锁定。</Notice> : null}
        {visibleValidationErrors.length > 0 ? <Notice tone={draftValidationErrors.length > 0 ? 'danger' : 'warning'}>{visibleValidationErrors.join(' ')}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Panel>

      {typeof calculation === 'string' ? null : (
        <>
          <Panel
            title="收益分配汇总"
            description="展示本月理论收益、对外应付、负责人收益、差额留存和尾差归属。"
          >
            <div className="summary-grid">
              <div className="summary-item">
                <span>普通合伙人年化收益率</span>
                <strong className={decimal(calculation.settlement.partnerAnnualRate).lt(0) ? 'danger-text' : ''}>
                  {formatRate(calculation.settlement.partnerAnnualRate)}
                </strong>
                <small>对外年化单利口径</small>
              </div>
              <div className="summary-item">
                <span>折合月收益率</span>
                <strong className={decimal(calculation.settlement.partnerMonthlyRateSnapshot).lt(0) ? 'danger-text' : ''}>
                  {formatRate(calculation.settlement.partnerMonthlyRateSnapshot)}
                </strong>
                <small>年化收益率 ÷ 12，不使用复利或 365 天折算</small>
              </div>
              <div className="summary-item">
                <span>负责人专项月收益率</span>
                <strong className={hasNegativeManagerRate ? 'danger-text' : ''}>
                  {formatRate(calculation.settlement.managerRate)}
                </strong>
                <small>
                  {calculation.settlement.allocationMode === 'auto_partner_rate'
                    ? '月总收益率 - 普通折合月率'
                    : '手动录入月率'}
                </small>
              </div>
              <div className="summary-item">
                <span>外部资金差额留存率</span>
                <strong className={hasNegativeRetainedRate ? 'danger-text' : ''}>
                  {formatRate(calculation.settlement.retainedRate)}
                </strong>
                <small>月总收益率 - 负责人月率 - 普通折合月率</small>
              </div>
              <div className="summary-item">
                <span>本月理论总收益</span>
                <strong>{formatMoney(calculation.settlement.totalProfit)}</strong>
                <small>折算本金 × 本月总收益率</small>
              </div>
              <div className="summary-item">
                <span>对外合伙人应付收益</span>
                <strong>{formatMoney(calculation.settlement.externalPayableProfit)}</strong>
                <small>非负责人当月应付收益</small>
              </div>
              <div className="summary-item">
                <span>负责人自有资金收益</span>
                <strong>{formatMoney(managerOwnCapitalProfit)}</strong>
                <small>负责人折算本金 × 本月总收益率</small>
              </div>
              <div className="summary-item">
                <span>负责人专项收益</span>
                <strong>{formatMoney(calculation.settlement.managerProfit)}</strong>
                <small>非负责人折算本金 × 负责人专项月收益率</small>
              </div>
              <div className="summary-item">
                <span>外部资金差额留存</span>
                <strong className={hasNegativeRetainedRate ? 'danger-text' : ''}>
                  {formatMoney(calculation.settlement.retainedProfit)}
                </strong>
                <small>仅基于非负责人折算本金；{retainedHandlingText(calculation.settlement.retainedHandling)}</small>
              </div>
              <div className="summary-item">
                <span>尾差调整</span>
                <strong>{formatMoney(calculation.settlement.roundingAdjustmentAmount)}</strong>
                <small>因四舍五入产生的结算尾差</small>
              </div>
              <div className="summary-item">
                <span>尾差归属</span>
                <strong>{roundingAdjustmentTargetLabels[calculation.settlement.roundingAdjustmentTarget]}</strong>
                <small>默认由负责人承担或享有</small>
              </div>
              <div className="summary-item">
                <span>负责人理论收益</span>
                <strong>{formatMoney(calculation.settlement.managerTheoreticalProfit)}</strong>
                <small>负责人自有资金收益 + 专项收益，含尾差调整</small>
              </div>
            </div>
          </Panel>

          <Notice tone="info">
            外部资金差额留存仅基于非负责人折算本金计算，不影响负责人自有资金收益。尾差调整默认归负责人，不影响普通合伙人的已计算应付收益。
          </Notice>

          <Panel
            title="实际收入对账"
            description="本月实际可分配净收入是扣除成本、手续费、税费及其他必要支出后的可分配净收入，不是营业流水。"
          >
            <div className="form-grid">
              <Field label="本月实际可分配净收入">
                <input
                  inputMode="decimal"
                  value={actualDistributableNetIncome}
                  disabled={isLocked}
                  onChange={(event) => setActualDistributableNetIncome(event.target.value)}
                  placeholder="未录入实际收入"
                />
              </Field>
              <Field label="实际收入备注">
                <input
                  value={actualIncomeNote}
                  disabled={isLocked}
                  onChange={(event) => setActualIncomeNote(event.target.value)}
                  placeholder="差额较大时建议说明原因"
                />
              </Field>
            </div>

            {actualIncomeNotEntered ? <Notice tone="info">未录入实际收入，允许保存草稿。</Notice> : null}
            {managerActualNetProfitIsNegative ? (
              <Notice tone="danger">本月实际可分配收入不足以覆盖对外合伙人收益，负责人实际净收益为负数。</Notice>
            ) : null}
            {actualIncomeDiffIsLarge ? (
              <Notice tone="warning">实际可分配收入与理论总收益差额较大，请在备注中说明原因。</Notice>
            ) : null}
            {isLocked ? (
              <Notice tone="warning">已锁定或已调整月份不允许直接修改实际收入；如需修正，请新增调整记录。</Notice>
            ) : null}

            <div className="summary-grid">
              <div className="summary-item">
                <span>对外合伙人当月应付收益</span>
                <strong>{formatMoney(calculation.settlement.externalPayableProfit)}</strong>
                <small>非负责人分配收益合计</small>
              </div>
              <div className="summary-item">
                <span>负责人实际净收益</span>
                <strong className={managerActualNetProfitIsNegative ? 'danger-text' : ''}>
                  {formatOptionalMoney(calculation.settlement.managerActualNetProfit)}
                </strong>
                <small>实际可分配收入 - 对外应付收益</small>
              </div>
              <div className="summary-item">
                <span>理论总收益</span>
                <strong>{formatMoney(calculation.settlement.theoreticalTotalProfit)}</strong>
                <small>折算本金 × 本月总收益率</small>
              </div>
              <div className="summary-item">
                <span>实际收入差额</span>
                <strong>{formatOptionalMoney(calculation.settlement.actualIncomeDiff)}</strong>
                <small>实际可分配收入 - 理论总收益</small>
              </div>
              <div className="summary-item">
                <span>负责人理论收益</span>
                <strong>{formatMoney(calculation.settlement.managerTheoreticalProfit)}</strong>
                <small>负责人月度理论分配收益，含尾差调整</small>
              </div>
              <div className="summary-item">
                <span>负责人实际差额</span>
                <strong>{formatOptionalMoney(calculation.settlement.managerNetDiff)}</strong>
                <small>实际净收益 - 理论收益</small>
              </div>
            </div>
          </Panel>

          <Panel title="风险提示" description="系统仅提示风险，不自动改写任何已保存账务结果。">
            {riskMessages.length === 0 ? (
              <Notice tone="success">当前输入未发现需要拦截的结算风险。</Notice>
            ) : (
              <div className="risk-grid">
                {riskMessages.map((item) => (
                  <Notice key={item.text} tone={item.tone}>
                    {item.text}
                  </Notice>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="月度分配明细"
            description={`参与计息折算本金：${formatMoney(calculation.settlement.totalCapital)}；首月月中加入资金按实际计息天数折算。`}
            actions={
              <div className="row-actions">
                <Button
                  type="button"
                  onClick={() => save('draft')}
                  disabled={isLocked || draftValidationErrors.length > 0}
                >
                  保存草稿
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => save('locked')}
                  disabled={isLocked || lockValidationErrors.length > 0}
                >
                  确认并锁定
                </Button>
              </div>
            }
          >
            {calculation.allocations.length === 0 ? (
              <EmptyState title="暂无可分配人员" description="请先录入合伙人和生效本金。" />
            ) : (
              <div className="table-wrap compact-wide-table settlement-allocation-table">
                <table>
                  <thead>
                    <tr>
                      <th>合伙人</th>
                      <th className="status-cell">角色</th>
                      <th className="money-cell">原始本金</th>
                      <th>起息日期</th>
                      <th className="status-cell">计息方式</th>
                      <th className="number-cell">当月天数</th>
                      <th className="number-cell">计息天数</th>
                      <th className="rate-cell">折算比例</th>
                      <th className="money-cell">折算本金</th>
                      <th className="rate-cell">普通合伙人年化收益率</th>
                      <th className="rate-cell">折合月收益率</th>
                      <th className="money-cell">当月收益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.allocations.map((allocation) => (
                      <tr key={allocation.capitalLotId}>
                        <td className="strong-cell">{allocation.memberName}</td>
                        <td className="status-cell">{allocation.memberRole === 'manager' ? <Badge tone="accent">负责人</Badge> : '合伙人'}</td>
                        <td className="money-cell">{formatMoney(allocation.originalCapital)}</td>
                        <td>{formatDate(allocation.startDate)}</td>
                        <td className="status-cell">
                          <Badge tone={allocation.prorationType === 'first_month_prorated' ? 'warning' : 'success'}>
                            {prorationTypeText(allocation.prorationType)}
                          </Badge>
                        </td>
                        <td className="number-cell">{allocation.daysInMonth}</td>
                        <td className="number-cell">{allocation.interestDays}</td>
                        <td className="rate-cell">{formatRatio(allocation.prorationFactor)}</td>
                        <td className="money-cell">{formatMoney(allocation.equivalentCapital)}</td>
                        <td className="rate-cell">{formatRate(calculation.settlement.partnerAnnualRate)}</td>
                        <td className="rate-cell">{formatRate(calculation.settlement.partnerMonthlyRateSnapshot)}</td>
                        <td className="money-cell strong-number">{formatMoney(allocationDisplayProfit(allocation))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="bottom-action-bar">
            <div>
              <strong>月度结算操作</strong>
              <span>确认并锁定前请先完成人工复核；锁定必须二次确认。</span>
            </div>
            <div className="toolbar-row">
              <Button
                type="button"
                onClick={() => save('draft')}
                disabled={isLocked || draftValidationErrors.length > 0}
              >
                保存草稿
              </Button>
              <Button type="button" onClick={exportMonthlyCsv}>导出 CSV</Button>
              <Button type="button" onClick={exportMonthlyExcel}>导出美化 Excel</Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => save('locked')}
                disabled={isLocked || lockValidationErrors.length > 0}
              >
                确认并锁定
              </Button>
            </div>
          </div>

          {isLocked ? (
            <Panel
              title="调整记录"
              description="已锁定月份如需修正，只新增调整记录，不覆盖原始结算和分配明细。调整金额会在年度汇总中单独展示。"
            >
              <form className="form-grid form-grid-wide" onSubmit={saveAdjustment}>
                <Field label="目标月份">
                  <input type="month" value={month} disabled />
                </Field>
                <Field label="调整入账月份">
                  <input
                    type="month"
                    value={adjustmentForm.adjustmentMonth}
                    onChange={(event) =>
                      setAdjustmentForm((value) => ({ ...value, adjustmentMonth: event.target.value }))
                    }
                  />
                </Field>
                <Field label="归属成员" hint="留空表示公司级或说明类调整">
                  <select
                    value={adjustmentForm.memberId}
                    onChange={(event) =>
                      setAdjustmentForm((value) => ({ ...value, memberId: event.target.value }))
                    }
                  >
                    <option value="">不归属个人</option>
                    {data.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="调整类型">
                  <select
                    value={adjustmentForm.type}
                    onChange={(event) =>
                      setAdjustmentForm((value) => ({
                        ...value,
                        type: event.target.value as AdjustmentRecordType,
                      }))
                    }
                  >
                    {Object.entries(adjustmentTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="调整金额">
                  <input
                    inputMode="decimal"
                    value={adjustmentForm.amount}
                    onChange={(event) =>
                      setAdjustmentForm((value) => ({ ...value, amount: event.target.value }))
                    }
                  />
                </Field>
                <Field label="调整原因">
                  <input
                    value={adjustmentForm.reason}
                    onChange={(event) =>
                      setAdjustmentForm((value) => ({ ...value, reason: event.target.value }))
                    }
                    placeholder="必填，说明调整依据"
                  />
                </Field>
                <div className="form-actions">
                  <Button type="submit" variant="primary">新增调整记录</Button>
                </div>
              </form>

              {monthAdjustments.length === 0 ? (
                <EmptyState title="暂无调整记录" description="新增调整后，目标月份会保持原始锁定结果并标记为已调整。" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>调整月份</th>
                        <th>归属成员</th>
                        <th>类型</th>
                        <th className="money-cell">金额</th>
                        <th>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthAdjustments.map((record) => (
                        <tr key={record.id}>
                          <td>{formatMonth(record.adjustmentMonth)}</td>
                          <td>
                            {record.memberId
                              ? data.members.find((member) => member.id === record.memberId)?.name ?? '未知成员'
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
          ) : null}
        </>
      )}
    </div>
  )
}
