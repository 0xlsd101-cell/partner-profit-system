import { Copy, RotateCcw, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ProfitCalculatorInput, ProfitCalculatorRecord } from '../domain/types'
import {
  PROFIT_CALCULATOR_RECORD_TYPE,
  annualRatePercentInputToRate,
  buildProfitCalculatorCopyText,
  calculateProfitCalculator,
  formatProfitCalculatorRate,
  validateProfitCalculatorInput,
} from '../domain/profitCalculator'
import { createId, nowIso, todayDate } from '../utils/date'
import { formatDate, formatMoney } from '../utils/format'
import { isDecimalLike } from '../utils/decimal'
import { profitCalculatorRecordsFileName } from '../utils/fileName'
import { buildProfitCalculatorRecordsCsv, downloadTextFile } from '../storage/exportImport'
import { exportProfitCalculatorRecordsXlsx } from '../storage/xlsxReports'
import { Badge, Button, Field, Notice, NumberStepperInput, PageHeader, Panel } from '../components/common'
import type { PageProps } from './pageTypes'

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

export function ProfitCalculatorPage({ data, repository, reload, notify }: PageProps) {
  const [form, setForm] = useState<CalculatorState>(initialState)
  const [error, setError] = useState('')
  const isCalendarYearMode = form.calculatorMode === 'calendar_year'

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
      return { input, result: null, errors }
    }

    return {
      input,
      result: calculateProfitCalculator(input),
      errors,
    }
  }, [form])

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

  async function exportRecordsExcel() {
    await exportProfitCalculatorRecordsXlsx(data)
    notify('收益测算记录美化 Excel 已导出。')
  }

  function exportRecordsCsv() {
    const year = new Date().getFullYear()

    downloadTextFile(
      profitCalculatorRecordsFileName(year),
      buildProfitCalculatorRecordsCsv(data, year),
      'text/csv;charset=utf-8',
    )
    notify('收益测算记录 CSV 已导出。')
  }

  const result = calculation.result
  const shownErrors = error ? [error] : calculation.errors

  return (
    <div className="page-stack">
      <PageHeader
        title="收益计算器"
        description="独立临时测算工具，不写入月度结算、年度汇总或正式分红数据。"
        actions={
          <div className="toolbar-row">
            <Button type="button" onClick={exportRecordsCsv}>导出 CSV</Button>
            <Button type="button" onClick={exportRecordsExcel}>导出美化 Excel</Button>
            <Badge tone="accent">年化单利口径</Badge>
          </div>
        }
      />

      <Notice tone="info">
        计算器结果仅用于临时测算和留档。自然年度清算按每年 1 月 1 日至 12 月 31 日统计；固定月数测算按输入月数统计。
      </Notice>

      <div className="calculator-page-grid">
        <Panel title="输入区" description="年化收益率前端按百分比输入，系统内部按年化收益率 ÷ 12 折算月收益率。">
          <div className="form-grid calculator-form-grid">
            <Field label="测算模式">
              <select
                value={form.calculatorMode}
                onChange={(event) =>
                  updateField('calculatorMode', event.target.value as CalculatorState['calculatorMode'])
                }
              >
                <option value="calendar_year">自然年度清算模式</option>
                <option value="cycle_months">实际投入月数模式</option>
              </select>
            </Field>
            <Field label="关联合伙人" hint="可选，仅用于测算记录标记">
              <select value={form.memberId} onChange={(event) => updateField('memberId', event.target.value)}>
                <option value="">不关联</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
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
              <Field label="清算年度" hint="自然年度固定为 1 月 1 日至 12 月 31 日">
                <NumberStepperInput
                  inputMode="numeric"
                  value={form.settlementYear}
                  aria-label="清算年度"
                  onValueChange={(value) => updateField('settlementYear', value)}
                />
              </Field>
            ) : (
              <Field label="实际投入月数" hint="第一版支持 1 到 12 个月">
                <NumberStepperInput
                  inputMode="decimal"
                  min="1"
                  max="12"
                  step="1"
                  value={form.settlementCycleMonths}
                  aria-label="实际投入月数"
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

          <div className="form-actions">
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
        </Panel>

        <Panel title="结果区" description="所有金额按两位小数展示，结果不进入正式账务。">
          <div className="summary-grid calculator-page-result-grid">
            <div className="summary-item">
              <span>测算模式</span>
              <strong>{isCalendarYearMode ? '自然年度清算' : '实际投入月数'}</strong>
              <small>{isCalendarYearMode ? '公历自然年度' : '按输入月数测算'}</small>
            </div>
            <div className="summary-item">
              <span>投资金额</span>
              <strong>{form.investmentAmount ? formatMoney(form.investmentAmount) : '-'}</strong>
              <small>临时测算本金</small>
            </div>
            <div className="summary-item">
              <span>年化收益率</span>
              <strong>{calculation.input ? formatProfitCalculatorRate(calculation.input.annualRate) : '-'}</strong>
              <small>年化单利</small>
            </div>
            <div className="summary-item">
              <span>折合月收益率</span>
              <strong>{result ? formatProfitCalculatorRate(result.monthlyRate) : '-'}</strong>
              <small>年化收益率 ÷ 12</small>
            </div>
            <div className="summary-item">
              <span>起息日期</span>
              <strong>{formatDate(form.startDate)}</strong>
              <small>入金当天计息</small>
            </div>
            <div className="summary-item">
              <span>年度截止日</span>
              <strong>{result?.periodEndDate ? formatDate(result.periodEndDate) : '-'}</strong>
              <small>{isCalendarYearMode ? '当年 12 月 31 日' : '固定月数模式不适用'}</small>
            </div>
            <div className="summary-item">
              <span>首月计息天数</span>
              <strong>{result ? `${result.firstMonthInterestDays}/${result.firstMonthDays} 天` : '-'}</strong>
              <small>首月按实际天数折算</small>
            </div>
            <div className="summary-item">
              <span>后续整月数</span>
              <strong>{monthText(result?.fullMonthCount)}</strong>
              <small>{isCalendarYearMode ? '起息月之后至 12 月' : '实际投入月数 - 1'}</small>
            </div>
            <div className="summary-item">
              <span>实际收益</span>
              <strong>{result ? formatMoney(result.totalProfit) : '-'}</strong>
              <small>首月收益 + 后续整月收益</small>
            </div>
            <div className="summary-item">
              <span>本息合计</span>
              <strong>{result ? formatMoney(result.principalPlusProfit) : '-'}</strong>
              <small>投资金额 + 实际收益</small>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
