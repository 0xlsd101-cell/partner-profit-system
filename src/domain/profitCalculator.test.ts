import { describe, expect, it } from 'vitest'
import {
  annualRatePercentInputToRate,
  buildProfitCalculatorCopyText,
  calculateProfitCalculator,
  validateProfitCalculatorInput,
} from './profitCalculator'

describe('profit calculator', () => {
  it('calculates first month by days and following months as full months', () => {
    const input = {
      investmentAmount: '100000',
      annualRate: annualRatePercentInputToRate('5'),
      startDate: '2026-01-16',
      settlementCycleMonths: '6',
    }
    const result = calculateProfitCalculator(input)

    expect(input.annualRate).toBe('0.05')
    expect(result.monthlyRate).toBe('0.0041666667')
    expect(result.firstMonthDays).toBe(31)
    expect(result.firstMonthInterestDays).toBe(16)
    expect(result.firstMonthProfit).toBe('215.05')
    expect(result.fullMonthCount).toBe('5')
    expect(result.fullMonthProfit).toBe('2083.33')
    expect(result.totalProfit).toBe('2298.39')
    expect(result.principalPlusProfit).toBe('102298.39')
    expect(buildProfitCalculatorCopyText(input, result)).toBe(
      [
        '投资金额：100,000',
        '年化收益率：5%',
        '起息日期：2026年1月16日',
        '清算周期：6个月',
        '首月计息天数：16/31天',
        '总收益：2,298.39',
        '本息合计：102,298.39',
      ].join('\n'),
    )
  })

  it('rejects settlement cycles greater than 12', () => {
    expect(
      validateProfitCalculatorInput({
        investmentAmount: '100000',
        annualRate: '0.05',
        startDate: '2026-01-01',
        settlementCycleMonths: '13',
      }),
    ).toContain('清算周期必须在 1 到 12 个月之间。')
  })

  it('calculates a calendar-year settlement from a mid-year start date', () => {
    const result = calculateProfitCalculator({
      investmentAmount: '100000',
      annualRate: '0.06',
      startDate: '2026-07-15',
      settlementCycleMonths: '12',
      settlementYear: '2026',
      calculatorMode: 'calendar_year',
    })

    expect(result.periodStartDate).toBe('2026-01-01')
    expect(result.periodEndDate).toBe('2026-12-31')
    expect(result.monthlyRate).toBe('0.005')
    expect(result.firstMonthDays).toBe(31)
    expect(result.firstMonthInterestDays).toBe(17)
    expect(result.firstMonthProfit).toBe('274.19')
    expect(result.fullMonthCount).toBe('5')
    expect(result.fullMonthProfit).toBe('2500.00')
    expect(result.totalProfit).toBe('2774.19')
  })

  it('calculates a full calendar-year profit from January 1', () => {
    const result = calculateProfitCalculator({
      investmentAmount: '100000',
      annualRate: '0.06',
      startDate: '2026-01-01',
      settlementCycleMonths: '12',
      settlementYear: '2026',
      calculatorMode: 'calendar_year',
    })

    expect(result.firstMonthInterestDays).toBe(31)
    expect(result.fullMonthCount).toBe('11')
    expect(result.totalProfit).toBe('6000.00')
  })

  it('calculates only the remaining days when the start date is in December', () => {
    const result = calculateProfitCalculator({
      investmentAmount: '100000',
      annualRate: '0.06',
      startDate: '2026-12-15',
      settlementCycleMonths: '12',
      settlementYear: '2026',
      calculatorMode: 'calendar_year',
    })

    expect(result.firstMonthDays).toBe(31)
    expect(result.firstMonthInterestDays).toBe(17)
    expect(result.fullMonthCount).toBe('0')
    expect(result.totalProfit).toBe('274.19')
  })

  it('returns zero profit when the start date is after the calendar year', () => {
    const result = calculateProfitCalculator({
      investmentAmount: '100000',
      annualRate: '0.06',
      startDate: '2027-01-01',
      settlementCycleMonths: '12',
      settlementYear: '2026',
      calculatorMode: 'calendar_year',
    })

    expect(result.periodStartDate).toBe('2026-01-01')
    expect(result.periodEndDate).toBe('2026-12-31')
    expect(result.firstMonthInterestDays).toBe(0)
    expect(result.fullMonthCount).toBe('0')
    expect(result.totalProfit).toBe('0.00')
  })
})
