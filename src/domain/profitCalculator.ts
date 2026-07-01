import type { ProfitCalculatorInput, ProfitCalculatorRecord, ProfitCalculatorResult } from './types'
import { Decimal, decimal, isDecimalLike, moneyString, rateString } from '../utils/decimal'
import { calculateMonthlyRateFromAnnualRate, daysInNaturalMonth, getAnnualPeriod } from './calculation'
import { formatDate } from '../utils/format'

export const PROFIT_CALCULATOR_RECORD_TYPE = 'calculator_record' as const
export const PROFIT_CALCULATOR_SETTLEMENT_CYCLE_MONTHS = '12'

export function annualRatePercentInputToRate(value: string): string {
  return decimal(value || '0').div(100).toString()
}

export function validateProfitCalculatorInput(input: ProfitCalculatorInput): string[] {
  const errors: string[] = []
  const calculatorMode = input.calculatorMode ?? 'cycle_months'

  if (!isDecimalLike(input.investmentAmount) || decimal(input.investmentAmount).lte(0)) {
    errors.push('投资金额必须大于 0。')
  }

  if (!isDecimalLike(input.annualRate) || decimal(input.annualRate).lt(0)) {
    errors.push('年化收益率不能小于 0。')
  }

  if (!input.startDate) {
    errors.push('起息日期必须存在。')
  }

  if (calculatorMode === 'calendar_year') {
    if (!input.settlementYear || !/^\d{4}$/.test(input.settlementYear)) {
      errors.push('清算年度必须是 4 位年份。')
    }
  } else {
    if (
      !isDecimalLike(input.settlementCycleMonths) ||
      decimal(input.settlementCycleMonths).lt(1) ||
      decimal(input.settlementCycleMonths).gt(12)
    ) {
      errors.push('清算周期必须在 1 到 12 个月之间。')
    }
  }

  return errors
}

function calculateCalendarYearProfitCalculator(input: ProfitCalculatorInput): ProfitCalculatorResult {
  const investmentAmount = decimal(input.investmentAmount)
  const annualRate = decimal(input.annualRate)
  const settlementYear = Number(input.settlementYear)
  const annualPeriod = getAnnualPeriod(settlementYear)
  const monthlyRate = decimal(calculateMonthlyRateFromAnnualRate(annualRate))

  if (input.startDate > annualPeriod.periodEndDate) {
    return {
      calculatorMode: 'calendar_year',
      periodStartDate: annualPeriod.periodStartDate,
      periodEndDate: annualPeriod.periodEndDate,
      monthlyRate: rateString(monthlyRate),
      firstMonthDays: daysInNaturalMonth(`${settlementYear}-12`),
      firstMonthInterestDays: 0,
      firstMonthProfit: '0.00',
      fullMonthCount: '0',
      fullMonthProfit: '0.00',
      totalProfit: '0.00',
      principalPlusProfit: moneyString(investmentAmount),
    }
  }

  const effectiveStartDate =
    input.startDate < annualPeriod.periodStartDate ? annualPeriod.periodStartDate : input.startDate
  const firstMonth = effectiveStartDate.slice(0, 7)
  const firstMonthNumber = Number(firstMonth.slice(5, 7))
  const firstMonthDays = daysInNaturalMonth(firstMonth)
  const firstMonthInterestDays = firstMonthDays - Number(effectiveStartDate.slice(8, 10)) + 1
  const firstMonthProfit = investmentAmount
    .mul(monthlyRate)
    .mul(firstMonthInterestDays)
    .div(firstMonthDays)
  const fullMonthCount = Decimal.max(12 - firstMonthNumber, 0)
  const fullMonthProfit = investmentAmount.mul(monthlyRate).mul(fullMonthCount)
  const totalProfit = firstMonthProfit.plus(fullMonthProfit)
  const principalPlusProfit = investmentAmount.plus(totalProfit)

  return {
    calculatorMode: 'calendar_year',
    periodStartDate: annualPeriod.periodStartDate,
    periodEndDate: annualPeriod.periodEndDate,
    monthlyRate: rateString(monthlyRate),
    firstMonthDays,
    firstMonthInterestDays,
    firstMonthProfit: moneyString(firstMonthProfit),
    fullMonthCount: fullMonthCount.toDecimalPlaces(4).toString(),
    fullMonthProfit: moneyString(fullMonthProfit),
    totalProfit: moneyString(totalProfit),
    principalPlusProfit: moneyString(principalPlusProfit),
  }
}

export function calculateProfitCalculator(input: ProfitCalculatorInput): ProfitCalculatorResult {
  const errors = validateProfitCalculatorInput(input)

  if (errors.length > 0) {
    throw new Error(errors.join(' '))
  }

  if ((input.calculatorMode ?? 'cycle_months') === 'calendar_year') {
    return calculateCalendarYearProfitCalculator(input)
  }

  const investmentAmount = decimal(input.investmentAmount)
  const annualRate = decimal(input.annualRate)
  const settlementCycleMonths = decimal(input.settlementCycleMonths)
  const monthlyRate = decimal(calculateMonthlyRateFromAnnualRate(annualRate))
  const firstMonth = input.startDate.slice(0, 7)
  const firstMonthDays = daysInNaturalMonth(firstMonth)
  const firstMonthInterestDays = firstMonthDays - Number(input.startDate.slice(8, 10)) + 1
  const firstMonthProfit = investmentAmount
    .mul(monthlyRate)
    .mul(firstMonthInterestDays)
    .div(firstMonthDays)
  const fullMonthCount = Decimal.max(settlementCycleMonths.minus(1), 0)
  const fullMonthProfit = investmentAmount.mul(monthlyRate).mul(fullMonthCount)
  const totalProfit = firstMonthProfit.plus(fullMonthProfit)
  const principalPlusProfit = investmentAmount.plus(totalProfit)

  return {
    calculatorMode: 'cycle_months',
    monthlyRate: rateString(monthlyRate),
    firstMonthDays,
    firstMonthInterestDays,
    firstMonthProfit: moneyString(firstMonthProfit),
    fullMonthCount: fullMonthCount.toDecimalPlaces(4).toString(),
    fullMonthProfit: moneyString(fullMonthProfit),
    totalProfit: moneyString(totalProfit),
    principalPlusProfit: moneyString(principalPlusProfit),
  }
}

export function formatProfitCalculatorRate(value: string): string {
  return `${decimal(value).mul(100).toFixed(4)}%`
}

function groupedMoney(value: string): string {
  const fixed = moneyString(value)
  const negative = fixed.startsWith('-')
  const normalized = negative ? fixed.slice(1) : fixed
  const [integerPart, fractionPart] = normalized.split('.')
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const suffix = fractionPart === '00' ? '' : `.${fractionPart}`

  return `${negative ? '-' : ''}${groupedInteger}${suffix}`
}

function percentText(value: string): string {
  const percent = decimal(value).mul(100).toDecimalPlaces(4)

  return `${percent.toString()}%`
}

function monthsText(value: string): string {
  return new Decimal(value).toDecimalPlaces(4).toString()
}

export function buildProfitCalculatorCopyText(
  input: ProfitCalculatorInput,
  result: ProfitCalculatorResult,
): string {
  if ((input.calculatorMode ?? 'cycle_months') === 'calendar_year') {
    return [
      `投资金额：${groupedMoney(input.investmentAmount)}`,
      `年化收益率：${percentText(input.annualRate)}`,
      `起息日期：${formatDate(input.startDate)}`,
      `清算年度：${input.settlementYear}年`,
      `统计周期：${formatDate(result.periodStartDate)} 至 ${formatDate(result.periodEndDate)}`,
      `首月计息天数：${result.firstMonthInterestDays}/${result.firstMonthDays}天`,
      `年度周期收益：${groupedMoney(result.totalProfit)}`,
      `本息合计：${groupedMoney(result.principalPlusProfit)}`,
    ].join('\n')
  }

  return [
    `投资金额：${groupedMoney(input.investmentAmount)}`,
    `年化收益率：${percentText(input.annualRate)}`,
    `起息日期：${formatDate(input.startDate)}`,
    `清算周期：${monthsText(input.settlementCycleMonths)}个月`,
    `首月计息天数：${result.firstMonthInterestDays}/${result.firstMonthDays}天`,
    `总收益：${groupedMoney(result.totalProfit)}`,
    `本息合计：${groupedMoney(result.principalPlusProfit)}`,
  ].join('\n')
}

export function normalizeProfitCalculatorRecord(
  record: ProfitCalculatorRecord,
): ProfitCalculatorRecord {
  return {
    ...record,
    recordType: PROFIT_CALCULATOR_RECORD_TYPE,
    calculatorMode: record.calculatorMode ?? 'cycle_months',
    startDate: record.startDate || record.createdAt.slice(0, 10),
    settlementCycleMonths:
      record.settlementCycleMonths || PROFIT_CALCULATOR_SETTLEMENT_CYCLE_MONTHS,
  }
}
