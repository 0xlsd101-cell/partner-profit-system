import { Copy, RotateCcw, Save, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Member, ProfitCalculatorInput, ProfitCalculatorRecord } from '../domain/types'
import {
  PROFIT_CALCULATOR_RECORD_TYPE,
  annualRatePercentInputToRate,
  buildProfitCalculatorCopyText,
  calculateProfitCalculator,
  formatProfitCalculatorRate,
  validateProfitCalculatorInput,
} from '../domain/profitCalculator'
import type { PartnerRepository } from '../storage/repository'
import { createId, nowIso, todayDate } from '../utils/date'
import { formatDate, formatMoney } from '../utils/format'
import { isDecimalLike } from '../utils/decimal'
import { Button, Field, Notice, NumberStepperInput } from './common'

interface ProfitCalculatorModalProps {
  open: boolean
  members: Member[]
  repository: Pick<PartnerRepository, 'saveProfitCalculatorRecord'>
  reload: () => Promise<void>
  notify: (message: string) => void
  onClose: () => void
}

interface CalculatorState {
  memberId: string
  calculatorMode: 'cycle_months' | 'calendar_year'
  investmentAmount: string
  annualRatePercent: string
  startDate: string
  settlementCycleMonths: string
  settlementYear: string
  note: string
}

const initialState: CalculatorState = {
  memberId: '',
  calculatorMode: 'calendar_year',
  investmentAmount: '',
  annualRatePercent: '5',
  startDate: todayDate(),
  settlementCycleMonths: '12',
  settlementYear: String(new Date().getFullYear()),
  note: '',
}

function monthText(value?: string): string {
  return value ? `${value} 个月` : '-'
}

export function ProfitCalculatorModal({
  open,
  members,
  repository,
  reload,
  notify,
  onClose,
}: ProfitCalculatorModalProps) {
  const [form, setForm] = useState<CalculatorState>(initialState)
  const [error, setError] = useState('')

  const calculation = useMemo(() => {
    if (!isDecimalLike(form.annualRatePercent)) {
      return {
        input: null,
        result: null,
        errors: ['年化收益率必须是有效数字。'],
      }
    }

    const input: ProfitCalculatorInput = {
      memberId: form.memberId || undefined,
      investmentAmount: form.investmentAmount,
      annualRate: annualRatePercentInputToRate(form.annualRatePercent),
      startDate: form.startDate,
      settlementCycleMonths: form.settlementCycleMonths || '12',
      settlementYear: form.settlementYear,
      calculatorMode: form.calculatorMode,
      note: form.note.trim() || undefined,
    }
    const errors = validateProfitCalculatorInput(input)

    if (errors.length > 0) {
      return {
        input,
        result: null,
        errors,
      }
    }

    return {
      input,
      result: calculateProfitCalculator(input),
      errors,
    }
  }, [form])

  if (!open) {
    return null
  }

  function updateField(field: keyof CalculatorState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  function reset() {
    setForm(initialState)
    setError('')
  }

  async function copyResult() {
    if (!calculation.input || !calculation.result) {
      setError(calculation.errors.join(' '))
      return
    }

    try {
      await navigator.clipboard.writeText(
        buildProfitCalculatorCopyText(calculation.input, calculation.result),
      )
      notify('收益测算结果已复制。')
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限。')
    }
  }

  async function saveRecord() {
    if (!calculation.input || !calculation.result) {
      setError(calculation.errors.join(' '))
      return
    }

    const now = nowIso()
    const record: ProfitCalculatorRecord = {
      ...calculation.input,
      ...calculation.result,
      id: createId('profit_calculator_record'),
      recordType: PROFIT_CALCULATOR_RECORD_TYPE,
      createdAt: now,
      updatedAt: now,
    }

    await repository.saveProfitCalculatorRecord(record)
    await reload()
    notify('测算记录已保存，不影响正式账务。')
  }

  const result = calculation.result
  const shownErrors = error ? [error] : calculation.errors
  const isCalendarYearMode = form.calculatorMode === 'calendar_year'

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="modal-panel calculator-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profit-calculator-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="profit-calculator-title">收益计算器</h2>
            <p>临时测算采用年化单利口径，月收益率 = 年化收益率 ÷ 12，不写入正式账务。</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭收益计算器" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-grid form-grid-wide">
            <Field label="关联合伙人" hint="可选，仅用于测算记录标记">
              <select value={form.memberId} onChange={(event) => updateField('memberId', event.target.value)}>
                <option value="">不关联</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="测算模式">
              <select
                value={form.calculatorMode}
                onChange={(event) =>
                  updateField('calculatorMode', event.target.value as CalculatorState['calculatorMode'])
                }
              >
                <option value="calendar_year">自然年度清算</option>
                <option value="cycle_months">固定月数测算</option>
              </select>
            </Field>
            <Field label="投资金额">
              <input
                inputMode="decimal"
                value={form.investmentAmount}
                onChange={(event) => updateField('investmentAmount', event.target.value)}
                placeholder="例如：100000"
              />
            </Field>
            <Field label="年化收益率（%）">
              <input
                inputMode="decimal"
                value={form.annualRatePercent}
                onChange={(event) => updateField('annualRatePercent', event.target.value)}
                placeholder="例如：5"
              />
            </Field>
            <Field label="起息日期">
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => updateField('startDate', event.target.value)}
                onInput={(event) => updateField('startDate', event.currentTarget.value)}
              />
            </Field>
            {isCalendarYearMode ? (
              <Field label="清算年度" hint="年度周期固定为 1 月 1 日至 12 月 31 日">
                <NumberStepperInput
                  inputMode="numeric"
                  value={form.settlementYear}
                  aria-label="清算年度"
                  onValueChange={(value) => updateField('settlementYear', value)}
                />
              </Field>
            ) : (
              <Field label="清算周期（月）">
                <NumberStepperInput
                  inputMode="decimal"
                  min="1"
                  max="12"
                  step="1"
                  value={form.settlementCycleMonths}
                  aria-label="清算周期（月）"
                  onValueChange={(value) => updateField('settlementCycleMonths', value)}
                />
              </Field>
            )}
            <Field label="备注">
              <input
                value={form.note}
                onChange={(event) => updateField('note', event.target.value)}
                placeholder="可选"
              />
            </Field>
          </div>

          {shownErrors.length > 0 ? <Notice tone="warning">{shownErrors.join(' ')}</Notice> : null}

          <div className="summary-grid calculator-result-grid">
            <div className="summary-item">
              <span>清算模式</span>
              <strong>{isCalendarYearMode ? '自然年度清算' : '固定月数测算'}</strong>
              <small>{isCalendarYearMode ? '公历自然年度' : '按输入月数测算'}</small>
            </div>
            {isCalendarYearMode ? (
              <div className="summary-item">
                <span>统计周期</span>
                <strong>
                  {result?.periodStartDate && result.periodEndDate
                    ? `${formatDate(result.periodStartDate)} 至 ${formatDate(result.periodEndDate)}`
                    : '-'}
                </strong>
                <small>每年 1 月 1 日至 12 月 31 日</small>
              </div>
            ) : null}
            <div className="summary-item">
              <span>年化收益率</span>
              <strong>{calculation.input ? formatProfitCalculatorRate(calculation.input.annualRate) : '-'}</strong>
              <small>对外年化单利口径</small>
            </div>
            <div className="summary-item">
              <span>折合月收益率</span>
              <strong>{result ? formatProfitCalculatorRate(result.monthlyRate) : '-'}</strong>
              <small>年化收益率 ÷ 12</small>
            </div>
            <div className="summary-item">
              <span>后续整月收益</span>
              <strong>{result ? formatMoney(result.fullMonthProfit) : '-'}</strong>
              <small>后续整月收益合计</small>
            </div>
            <div className="summary-item">
              <span>首月收益</span>
              <strong>{result ? formatMoney(result.firstMonthProfit) : '-'}</strong>
              <small>首月按实际计息天数折算</small>
            </div>
            <div className="summary-item">
              <span>本息合计</span>
              <strong>{result ? formatMoney(result.principalPlusProfit) : '-'}</strong>
              <small>投资金额 + 实际收益</small>
            </div>
            <div className="summary-item">
              <span>后续整月数</span>
              <strong>{monthText(result?.fullMonthCount)}</strong>
              <small>{isCalendarYearMode ? '起息月之后至 12 月' : '清算周期 - 1'}</small>
            </div>
            <div className="summary-item">
              <span>{isCalendarYearMode ? '年度周期收益' : '总收益'}</span>
              <strong>{result ? formatMoney(result.totalProfit) : '-'}</strong>
              <small>{isCalendarYearMode ? '自然年度内收益' : '首月收益 + 后续整月收益'}</small>
            </div>
          </div>

          <Notice tone="info">
            自然年度清算采用公历年度，年度开始日为 1 月 1 日，年度截止日为 12 月 31 日。保存测算记录仅用于临时测算留档，不影响月度结算、年度汇总或正式分红数据。
          </Notice>
        </div>

        <div className="modal-footer">
          <Button type="button" onClick={reset}>
            <RotateCcw size={16} />
            重置
          </Button>
          <Button type="button" onClick={copyResult} disabled={!result}>
            <Copy size={16} />
            复制结果
          </Button>
          <Button type="button" variant="primary" onClick={saveRecord} disabled={!result}>
            <Save size={16} />
            保存测算记录
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
