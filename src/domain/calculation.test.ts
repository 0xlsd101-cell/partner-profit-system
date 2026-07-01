import { describe, expect, it } from 'vitest'
import {
  annualDividendPaymentBasisLabel,
  annualDividendPaymentPayableAmount,
  annualDividendPaymentUnpaidAmount,
  calculateAnnualRetainedProfit,
  calculateAnnualDividendConfirmationDrafts,
  calculateAnnualSummary,
  calculateAnnualSummaryResult,
  buildCapitalLots,
  calculateMonthlyRateFromAnnualRate,
  calculateMemberAnnualDetail,
  calculateMonthlySettlement,
  calculatePartnerProfitByAnnualRate,
  canEditMonthlySettlement,
  getAnnualPeriod,
  normalizeMonthlySettlement,
} from './calculation'
import { validateSettlementInput } from './validation'
import type {
  AnnualSummaryRow,
  AppData,
  CapitalLot,
  CapitalTransaction,
  DividendPayment,
  Member,
  MonthlyAllocation,
  MonthlySettlement,
  ProfitCalculatorRecord,
} from './types'
import {
  buildAnnualDividendConfirmationsCsv,
  buildAnnualSummaryCsv,
  buildDividendPaymentsCsv,
  buildJsonExport,
  buildMemberAnnualDetailCsv,
  buildMemberDividendSlipCsv,
  buildMonthlySettlementCsv,
  buildOperationLogsCsv,
  buildProfitCalculatorRecordsCsv,
  parseJsonImport,
} from '../storage/exportImport'
import {
  buildAnnualDividendConfirmationsXlsxReport,
  buildAnnualSummaryXlsxReport,
  buildDividendPaymentsXlsxReport,
  buildMemberAnnualDetailXlsxReport,
  buildMonthlySettlementXlsxReport,
  buildOperationLogsXlsxReport,
  buildProfitCalculatorRecordsXlsxReport,
} from '../storage/xlsxReports'
import { validateImportAllocationsAgainstLockedSettlements } from '../storage/importSafety'
import { assertCanUnsafeReplaceAllDataForDemoOnly, coreBusinessDataCounts } from '../storage/dataSafety'
import { calculateProfitCalculator } from './profitCalculator'
import {
  annualSummaryFileName,
  annualSummaryXlsxFileName,
  buildBackupFileName,
  dividendPaymentsFileName,
  dividendPaymentsXlsxFileName,
  memberAnnualDetailFileName,
  memberAnnualDetailXlsxFileName,
  memberDividendSlipFileName,
  monthlySettlementXlsxFileName,
  monthlySettlementFileName,
  operationLogsFileName,
  operationLogsXlsxFileName,
  profitCalculatorRecordsFileName,
} from '../utils/fileName'
import { buildExcelReportBuffer, classifyExcelMessageTone } from '../utils/excelExport'
import {
  formatDate,
  formatMoney,
  operationActionLabel,
  settlementStatusLabels,
} from '../utils/format'

const members: Member[] = [
  {
    id: 'm_manager',
    name: '张三',
    role: 'manager',
    status: 'active',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'm_partner',
    name: '李四',
    role: 'partner',
    status: 'active',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const transactions: CapitalTransaction[] = [
  {
    id: 't1',
    memberId: 'm_manager',
    transactionDate: '2026-01-01',
    effectiveMonth: '2026-01',
    startDate: '2026-01-01',
    type: 'deposit',
    amount: '600000',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 't2',
    memberId: 'm_partner',
    transactionDate: '2026-01-01',
    effectiveMonth: '2026-01',
    startDate: '2026-01-01',
    type: 'deposit',
    amount: '400000',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function createCapitalLot(
  id: string,
  memberId: string,
  amount: string,
  status: CapitalLot['status'],
  startDate = '2026-01-01',
): CapitalLot {
  return {
    id,
    memberId,
    amount,
    startDate,
    status,
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function createMonthlySettlement(
  id: string,
  month: string,
  status: MonthlySettlement['status'],
): MonthlySettlement {
  return {
    id,
    month,
    status,
    allocationMode: 'auto_partner_rate',
    totalRate: '0.025',
    managerRate: '0.02',
    partnerRate: '0.005',
    partnerAnnualRate: '0.06',
    partnerMonthlyRateSnapshot: '0.005',
    rateBasis: 'annual_simple',
    rateConversionMethod: 'divide_by_12',
    retainedRate: '0',
    totalCapital: '100000.00',
    totalProfit: '2500.00',
    managerProfit: '2000.00',
    partnerProfitPool: '500.00',
    retainedProfit: '0.00',
    retainedHandling: '',
    roundingAdjustmentAmount: '0.00',
    roundingAdjustmentTarget: 'manager',
    externalPayableProfit: '500.00',
    managerTheoreticalProfit: '2000.00',
    theoreticalTotalProfit: '2500.00',
    actualReconciliationStatus: 'not_entered',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function createMonthlyAllocation(
  id: string,
  settlementId: string,
  month: string,
  monthlyProfit: string,
): MonthlyAllocation {
  return {
    id,
    settlementId,
    month,
    memberId: 'm_partner',
    memberName: '李四',
    memberRole: 'partner',
    capitalLotId: 'lot_partner',
    originalCapital: '100000.00',
    startDate: `${month}-01`,
    prorationType: 'full_month',
    daysInMonth: 31,
    interestDays: 31,
    prorationFactor: '1',
    equivalentCapital: '100000.00',
    applicableRate: '0.005',
    memberCapital: '100000.00',
    capitalRatio: '1',
    partnerProfit: monthlyProfit,
    managerOwnCapitalProfit: '0.00',
    managerSpecialProfit: '0.00',
    totalProfit: monthlyProfit,
    managerProfit: '0.00',
    monthlyProfit,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('calculateMonthlySettlement', () => {
  it('calculates manager special profit and partner pool by capital ratio', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalLots: [],
      capitalTransactions: transactions,
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.totalCapital).toBe('1000000.00')
    expect(result.settlement.partnerRate).toBe('0.005')
    expect(result.settlement.retainedRate).toBe('0')
    expect(result.settlement.totalProfit).toBe('25000.00')
    expect(result.settlement.managerProfit).toBe('8000.00')
    expect(result.settlement.partnerProfitPool).toBe('2000.00')
    expect(result.settlement.retainedProfit).toBe('0.00')
    expect(result.settlement.externalPayableProfit).toBe('2000.00')
    expect(result.settlement.managerTheoreticalProfit).toBe('23000.00')
    expect(result.settlement.theoreticalTotalProfit).toBe('25000.00')
    expect(result.settlement.managerActualNetProfit).toBeUndefined()
    expect(result.settlement.actualIncomeDiff).toBeUndefined()
    expect(result.settlement.managerNetDiff).toBeUndefined()
    expect(result.settlement.actualReconciliationStatus).toBe('not_entered')

    expect(result.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memberId: 'm_manager',
          prorationType: 'full_month',
          originalCapital: '600000.00',
          equivalentCapital: '600000.00',
          applicableRate: '0.025',
          managerOwnCapitalProfit: '15000.00',
          managerSpecialProfit: '0.00',
          totalProfit: '15000.00',
          monthlyProfit: '15000.00',
        }),
        expect.objectContaining({
          memberId: 'm_partner',
          prorationType: 'full_month',
          originalCapital: '400000.00',
          equivalentCapital: '400000.00',
          partnerProfit: '2000.00',
          managerSpecialProfit: '8000.00',
          totalProfit: '10000.00',
          monthlyProfit: '2000.00',
        }),
      ]),
    )
  })

  it('calculates actual income reconciliation when actual income is entered', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      actualDistributableNetIncome: '24000',
      actualIncomeNote: 'lower than theoretical',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.actualDistributableNetIncome).toBe('24000.00')
    expect(result.settlement.actualDistributableIncome).toBe('24000.00')
    expect(result.settlement.externalPayableProfit).toBe('2000.00')
    expect(result.settlement.managerActualNetProfit).toBe('22000.00')
    expect(result.settlement.theoreticalTotalProfit).toBe('25000.00')
    expect(result.settlement.actualIncomeDiff).toBe('-1000.00')
    expect(result.settlement.managerTheoreticalProfit).toBe('23000.00')
    expect(result.settlement.managerNetDiff).toBe('-1000.00')
    expect(result.settlement.actualReconciliationStatus).toBe('draft')
    expect(result.settlement.actualIncomeNote).toBe('lower than theoretical')
  })

  it('flags manager net loss when actual net income is below external payable profit', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      actualDistributableNetIncome: '1000',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.externalPayableProfit).toBe('2000.00')
    expect(result.settlement.managerActualNetProfit).toBe('-1000.00')
    expect(result.settlement.managerNetDiff).toBe('-24000.00')
  })

  it('prorates capital by days only in the first month', () => {
    const proratedTransactions: CapitalTransaction[] = [
      transactions[0],
      {
        ...transactions[1],
        startDate: '2026-01-16',
      },
    ]
    const january = calculateMonthlySettlement({
      members,
      capitalTransactions: proratedTransactions,
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      settlementId: 'settlement_2026-01',
    })
    const february = calculateMonthlySettlement({
      members,
      capitalTransactions: proratedTransactions,
      month: '2026-02',
      totalRate: '0.025',
      managerRate: '0.02',
      settlementId: 'settlement_2026-02',
    })
    const januaryPartner = january.allocations.find((allocation) => allocation.memberId === 'm_partner')
    const februaryPartner = february.allocations.find((allocation) => allocation.memberId === 'm_partner')

    expect(januaryPartner).toEqual(
      expect.objectContaining({
        prorationType: 'first_month_prorated',
        daysInMonth: 31,
        interestDays: 16,
        prorationFactor: '0.5161290323',
        equivalentCapital: '206451.61',
        partnerProfit: '1032.26',
        managerSpecialProfit: '4129.03',
        totalProfit: '5161.29',
      }),
    )
    expect(january.settlement.totalCapital).toBe('806451.61')
    expect(january.settlement.totalProfit).toBe('20161.29')
    expect(februaryPartner).toEqual(
      expect.objectContaining({
        prorationType: 'full_month',
        interestDays: 28,
        prorationFactor: '1',
        equivalentCapital: '400000.00',
      }),
    )
  })

  it('uses 29 days for first-month proration in leap-year February', () => {
    const leapTransactions: CapitalTransaction[] = [
      transactions[0],
      {
        ...transactions[1],
        startDate: '2024-02-15',
        effectiveMonth: '2024-02',
      },
    ]
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: leapTransactions,
      month: '2024-02',
      totalRate: '0.025',
      managerRate: '0.02',
      settlementId: 'settlement_2024-02',
    })
    const partner = result.allocations.find((allocation) => allocation.memberId === 'm_partner')

    expect(partner).toEqual(
      expect.objectContaining({
        prorationType: 'first_month_prorated',
        daysInMonth: 29,
        interestDays: 15,
        prorationFactor: '0.5172413793',
        equivalentCapital: '206896.55',
      }),
    )
  })

  it('supports manual all-rates mode with retained profit', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      allocationMode: 'manual_all_rates',
      totalRate: '0.03',
      managerRate: '0.02',
      partnerRate: '0.005',
      retainedHandling: 'risk_reserve',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.partnerRate).toBe('0.005')
    expect(result.settlement.retainedRate).toBe('0.005')
    expect(result.settlement.totalProfit).toBe('30000.00')
    expect(result.settlement.managerProfit).toBe('8000.00')
    expect(result.settlement.partnerProfitPool).toBe('2000.00')
    expect(result.settlement.retainedProfit).toBe('2000.00')
    expect(result.settlement.retainedHandling).toBe('risk_reserve')
  })

  it('allows over-allocation drafts but rejects locking them', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      allocationMode: 'manual_all_rates',
      totalRate: '0.02',
      managerRate: '0.015',
      partnerRate: '0.01',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.retainedRate).toBe('-0.005')
    expect(validateSettlementInput(result, 'draft')).toEqual([])
    expect(validateSettlementInput(result, 'locked')).toContain('外部资金差额留存率不能小于 0，当前为超分配状态，禁止锁定。')
  })

  it('requires retained handling before locking positive retained profit', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      allocationMode: 'manual_all_rates',
      totalRate: '0.03',
      managerRate: '0.02',
      partnerRate: '0.005',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.retainedRate).toBe('0.005')
    expect(validateSettlementInput(result, 'locked')).toContain('存在外部资金差额留存时，锁定前必须选择处理方式。')
  })

  it('requires an actual income note before locking when the actual difference exceeds 10%', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      actualDistributableNetIncome: '20000',
      settlementId: 'settlement_2026-01',
    })

    expect(validateSettlementInput(result, 'locked')).toContain(
      '实际可分配净收入与理论总收益差额超过 10% 时，必须填写实际收入备注。',
    )
  })

  it('treats locked and adjusted settlements as not directly editable', () => {
    expect(canEditMonthlySettlement()).toBe(true)
    expect(canEditMonthlySettlement({ status: 'draft' })).toBe(true)
    expect(canEditMonthlySettlement({ status: 'locked' })).toBe(false)
    expect(canEditMonthlySettlement({ status: 'adjusted' })).toBe(false)
  })

  it('converts partner annual simple rate to monthly snapshot', () => {
    expect(calculateMonthlyRateFromAnnualRate('0.06')).toBe('0.005')
  })

  it('calculates full-month partner profit from annual simple rate', () => {
    expect(
      calculatePartnerProfitByAnnualRate({
        originalCapital: '100000',
        partnerAnnualRate: '0.06',
      }),
    ).toBe('500.00')
  })

  it('calculates first-month prorated partner profit from annual simple rate', () => {
    expect(
      calculatePartnerProfitByAnnualRate({
        originalCapital: '100000',
        partnerAnnualRate: '0.06',
        interestDays: 17,
        daysInMonth: 31,
      }),
    ).toBe('274.19')
  })

  it('migrates legacy monthly partnerRate to annual rate idempotently', () => {
    const legacy = {
      id: 'settlement_legacy',
      month: '2026-01',
      status: 'locked',
      allocationMode: 'auto_partner_rate',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerRate: '0.005',
      retainedRate: '0',
      totalCapital: '100000.00',
      totalProfit: '2500.00',
      managerProfit: '2000.00',
      partnerProfitPool: '500.00',
      retainedProfit: '0.00',
      retainedHandling: '',
      externalPayableProfit: '500.00',
      managerTheoreticalProfit: '2000.00',
      theoreticalTotalProfit: '2500.00',
      actualReconciliationStatus: 'not_entered',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as MonthlySettlement

    const migrated = normalizeMonthlySettlement(legacy)
    const migratedAgain = normalizeMonthlySettlement(migrated)

    expect(migrated.partnerMonthlyRateSnapshot).toBe('0.005')
    expect(migrated.partnerAnnualRate).toBe('0.06')
    expect(migrated.rateBasis).toBe('annual_simple')
    expect(migrated.rateConversionMethod).toBe('divide_by_12')
    expect(migratedAgain.partnerAnnualRate).toBe('0.06')
  })

  it('does not change locked historical amounts when migration fields are added', () => {
    const legacy = normalizeMonthlySettlement({
      id: 'settlement_locked_legacy',
      month: '2026-01',
      status: 'locked',
      allocationMode: 'auto_partner_rate',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerRate: '0.005',
      retainedRate: '0',
      totalCapital: '100000.00',
      totalProfit: '2500.00',
      managerProfit: '2000.00',
      partnerProfitPool: '500.00',
      retainedProfit: '0.00',
      retainedHandling: '',
      externalPayableProfit: '500.00',
      managerTheoreticalProfit: '2000.00',
      theoreticalTotalProfit: '2500.00',
      actualReconciliationStatus: 'not_entered',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as MonthlySettlement)

    expect(legacy.totalProfit).toBe('2500.00')
    expect(legacy.partnerProfitPool).toBe('500.00')
  })

  it('does not recalculate finalized historical amounts when retained wording fields are normalized', () => {
    const finalized = normalizeMonthlySettlement({
      id: 'settlement_adjusted_legacy',
      month: '2026-01',
      status: 'adjusted',
      allocationMode: 'manual_all_rates',
      totalRate: '0.016',
      managerRate: '0.01',
      partnerRate: '0.005',
      partnerAnnualRate: '0.06',
      partnerMonthlyRateSnapshot: '0.005',
      rateBasis: 'annual_simple',
      rateConversionMethod: 'divide_by_12',
      retainedRate: '0.001',
      totalCapital: '1000000.00',
      totalProfit: '16000.00',
      managerProfit: '8000.00',
      partnerProfitPool: '4000.00',
      retainedProfit: '800.00',
      retainedHandling: 'company_retained',
      externalPayableProfit: '4000.00',
      managerTheoreticalProfit: '11200.00',
      theoreticalTotalProfit: '16000.00',
      actualReconciliationStatus: 'not_entered',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as MonthlySettlement)

    expect(finalized.status).toBe('adjusted')
    expect(finalized.retainedProfit).toBe('800.00')
    expect(finalized.totalProfit).toBe('16000.00')
    expect(finalized.roundingAdjustmentAmount).toBe('0.00')
  })

  it('recalculates draft partner profit when partnerAnnualRate changes', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      allocationMode: 'manual_all_rates',
      totalRate: '0.03',
      managerRate: '0.02',
      partnerAnnualRate: '0.12',
      settlementId: 'settlement_2026-01',
    })
    const partner = result.allocations.find((allocation) => allocation.memberId === 'm_partner')

    expect(result.settlement.partnerMonthlyRateSnapshot).toBe('0.01')
    expect(partner?.partnerProfit).toBe('4000.00')
  })

  it('rejects locking when monthly total rate is below partner annual rate divided by 12', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      allocationMode: 'auto_partner_rate',
      totalRate: '0.004',
      managerRate: '0',
      partnerAnnualRate: '0.06',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.partnerMonthlyRateSnapshot).toBe('0.005')
    expect(result.settlement.managerRate).toBe('-0.001')
    expect(validateSettlementInput(result, 'locked')).toContain('负责人专项月收益率快照不能小于 0。')
  })

  it('calculates manager own capital profit from monthly total rate exactly', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [createCapitalLot('lot_manager_200000', 'm_manager', '200000', 'active')],
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.025',
      partnerAnnualRate: '0',
      settlementId: 'settlement_2026-01',
    })
    const managerAllocation = result.allocations.find((allocation) => allocation.memberId === 'm_manager')

    expect(managerAllocation?.managerOwnCapitalProfit).toBe('5000.00')
    expect(result.settlement.managerTheoreticalProfit).toBe('5000.00')
  })

  it('calculates full-month external partner profit from annual rate exactly', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [createCapitalLot('lot_partner_300000', 'm_partner', '300000', 'active')],
      month: '2026-01',
      totalRate: '0.005',
      managerRate: '0',
      partnerAnnualRate: '0.06',
      settlementId: 'settlement_2026-01',
    })
    const partnerAllocation = result.allocations.find((allocation) => allocation.memberId === 'm_partner')

    expect(result.settlement.partnerMonthlyRateSnapshot).toBe('0.005')
    expect(partnerAllocation?.partnerProfit).toBe('1500.00')
  })

  it('calculates first-month July proration from annual rate exactly', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [createCapitalLot('lot_partner_july', 'm_partner', '100000', 'active', '2026-07-15')],
      month: '2026-07',
      totalRate: '0.005',
      managerRate: '0',
      partnerAnnualRate: '0.06',
      settlementId: 'settlement_2026-07',
    })
    const partnerAllocation = result.allocations.find((allocation) => allocation.memberId === 'm_partner')

    expect(partnerAllocation?.daysInMonth).toBe(31)
    expect(partnerAllocation?.interestDays).toBe(17)
    expect(partnerAllocation?.partnerProfit).toBe('274.19')
  })

  it('calculates actual reconciliation with precise external payable amount', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [createCapitalLot('lot_partner_actual', 'm_partner', '574194', 'active')],
      month: '2026-01',
      totalRate: '0.005',
      managerRate: '0',
      partnerAnnualRate: '0.06',
      actualDistributableNetIncome: '25000',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.externalPayableProfit).toBe('2870.97')
    expect(result.settlement.managerActualNetProfit).toBe('22129.03')
  })

  it('calculates external retained profit only from non-manager equivalent capital', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [
        createCapitalLot('lot_manager_retained', 'm_manager', '200000', 'active'),
        createCapitalLot('lot_partner_retained', 'm_partner', '800000', 'active'),
      ],
      month: '2026-01',
      allocationMode: 'manual_all_rates',
      totalRate: '0.016',
      managerRate: '0.01',
      partnerAnnualRate: '0.06',
      retainedHandling: 'company_retained',
      settlementId: 'settlement_2026-01',
    })
    const managerAllocation = result.allocations.find((allocation) => allocation.memberId === 'm_manager')

    expect(result.settlement.retainedRate).toBe('0.001')
    expect(result.settlement.retainedProfit).toBe('800.00')
    expect(managerAllocation?.managerOwnCapitalProfit).toBe('3200.00')
  })

  it('records rounding adjustment and leaves partner payable profit unchanged', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [
        createCapitalLot('lot_manager_rounding', 'm_manager', '100000', 'active'),
        createCapitalLot('lot_partner_rounding_1', 'm_partner', '33.5', 'active'),
        createCapitalLot('lot_partner_rounding_2', 'm_partner', '33.5', 'active'),
        createCapitalLot('lot_partner_rounding_3', 'm_partner', '33.5', 'active'),
      ],
      month: '2026-01',
      totalRate: '0.01',
      managerRate: '0',
      partnerAnnualRate: '0.12',
      settlementId: 'settlement_2026-01',
    })
    const partnerProfits = result.allocations
      .filter((allocation) => allocation.memberId === 'm_partner')
      .map((allocation) => allocation.partnerProfit)

    expect(partnerProfits).toEqual(['0.34', '0.34', '0.34'])
    expect(result.settlement.roundingAdjustmentAmount).toBe('-0.01')
    expect(result.settlement.roundingAdjustmentTarget).toBe('manager')
    expect(result.settlement.managerTheoreticalProfit).toBe('999.99')
  })

  it('includes active capital lots and excludes withdrawn lots in new settlements', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [
        createCapitalLot('lot_active', 'm_partner', '300000', 'active'),
        createCapitalLot('lot_withdrawn', 'm_partner', '200000', 'withdrawn'),
      ],
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerAnnualRate: '0.06',
      settlementId: 'settlement_2026-01',
    })

    expect(result.settlement.totalCapital).toBe('300000.00')
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0]).toEqual(
      expect.objectContaining({
        capitalLotId: 'lot_active',
        originalCapital: '300000.00',
        partnerProfit: '1500.00',
      }),
    )
  })

  it('excludes withdrawn lots when recalculating a draft settlement', () => {
    const result = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [
        createCapitalLot('lot_active', 'm_partner', '100000', 'active'),
        createCapitalLot('lot_withdrawn', 'm_manager', '900000', 'withdrawn'),
      ],
      month: '2026-02',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerAnnualRate: '0.06',
      settlementId: 'draft_2026-02',
    })

    expect(result.settlement.totalCapital).toBe('100000.00')
    expect(result.allocations.some((allocation) => allocation.capitalLotId === 'lot_withdrawn')).toBe(false)
  })

  it('treats legacy capital lots without status as active', () => {
    const legacyLot = {
      ...createCapitalLot('lot_legacy', 'm_partner', '100000', 'active'),
      status: undefined as unknown as CapitalLot['status'],
    }
    const result = buildCapitalLots([], '2026-01', [legacyLot])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({ id: 'lot_legacy', status: 'active' }))
  })

  it('does not return withdrawn capital lots as active', () => {
    const result = buildCapitalLots([], '2026-01', [
      createCapitalLot('lot_withdrawn', 'm_partner', '100000', 'withdrawn'),
    ])

    expect(result).toHaveLength(0)
  })
})

describe('validateImportAllocationsAgainstLockedSettlements', () => {
  it('protects imported allocations with the same locked settlement id', () => {
    const currentAllocation = createMonthlyAllocation('allocation_locked', 'settlement_2026-01', '2026-01', '500.00')
    const result = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: [createMonthlySettlement('settlement_2026-01', '2026-01', 'locked')],
      currentAllocations: [currentAllocation],
      importedSettlements: [],
      importedAllocations: [{ ...currentAllocation, monthlyProfit: '9999.00' }],
    })

    expect(result.importableAllocations).toHaveLength(0)
    expect(result.summary.protectedSkippedAllocationCount).toBe(1)
    expect(result.summary.protectedMonths).toEqual(['2026-01'])
  })

  it('protects imported allocations for a locked month even when settlement id is different', () => {
    const result = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: [createMonthlySettlement('settlement_2026-01', '2026-01', 'locked')],
      currentAllocations: [],
      importedSettlements: [createMonthlySettlement('settlement_other', '2026-01', 'locked')],
      importedAllocations: [
        createMonthlyAllocation('allocation_other', 'settlement_other', '2026-01', '500.00'),
      ],
    })

    expect(result.importableAllocations).toHaveLength(0)
    expect(result.summary.protectedSkippedAllocationCount).toBe(1)
    expect(result.summary.protectedMonths).toEqual(['2026-01'])
  })

  it('allows imported allocations for an existing draft month', () => {
    const allocation = createMonthlyAllocation('allocation_draft', 'settlement_2026-02', '2026-02', '500.00')
    const result = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: [createMonthlySettlement('settlement_2026-02', '2026-02', 'draft')],
      currentAllocations: [],
      importedSettlements: [],
      importedAllocations: [allocation],
    })

    expect(result.importableAllocations).toEqual([allocation])
    expect(result.summary.protectedSkippedAllocationCount).toBe(0)
  })

  it('allows imported allocations for a new month with a matching imported settlement', () => {
    const allocation = createMonthlyAllocation('allocation_new', 'settlement_2026-03', '2026-03', '500.00')
    const result = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: [],
      currentAllocations: [],
      importedSettlements: [createMonthlySettlement('settlement_2026-03', '2026-03', 'locked')],
      importedAllocations: [allocation],
    })

    expect(result.importableAllocations).toEqual([allocation])
    expect(result.summary.importableAllocationCount).toBe(1)
  })

  it('marks allocations without a matching settlement as abnormal', () => {
    const result = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: [],
      currentAllocations: [],
      importedSettlements: [],
      importedAllocations: [
        createMonthlyAllocation('allocation_abnormal', 'missing_settlement', '2026-04', '500.00'),
      ],
    })

    expect(result.importableAllocations).toHaveLength(0)
    expect(result.summary.abnormalAllocationCount).toBe(1)
  })

  it('keeps locked allocation counts and amounts out of importable results', () => {
    const lockedAllocation = createMonthlyAllocation('allocation_locked', 'settlement_2026-01', '2026-01', '500.00')
    const result = validateImportAllocationsAgainstLockedSettlements({
      currentSettlements: [createMonthlySettlement('settlement_2026-01', '2026-01', 'locked')],
      currentAllocations: [lockedAllocation],
      importedSettlements: [],
      importedAllocations: [{ ...lockedAllocation, monthlyProfit: '9999.00' }],
    })
    const afterImportable = result.importableAllocations.filter(
      (allocation) => allocation.settlementId === 'settlement_2026-01',
    )

    expect(afterImportable).toHaveLength(0)
    expect(lockedAllocation.monthlyProfit).toBe('500.00')
  })
})

describe('annual calendar-year period', () => {
  it('returns the Gregorian natural-year start and end dates', () => {
    expect(getAnnualPeriod(2026)).toEqual({
      year: 2026,
      periodStartDate: '2026-01-01',
      periodEndDate: '2026-12-31',
    })
  })
})

describe('calculateAnnualSummary', () => {
  it('uses the Gregorian natural year and excludes drafts and next January', () => {
    const settlements = [
      createMonthlySettlement('settlement_2026-01', '2026-01', 'locked'),
      createMonthlySettlement('settlement_2026-12', '2026-12', 'adjusted'),
      createMonthlySettlement('settlement_2026-06', '2026-06', 'draft'),
      createMonthlySettlement('settlement_2027-01', '2027-01', 'locked'),
    ]
    const allocations = [
      createMonthlyAllocation('a_2026_01', 'settlement_2026-01', '2026-01', '100.00'),
      createMonthlyAllocation('a_2026_12', 'settlement_2026-12', '2026-12', '200.00'),
      createMonthlyAllocation('a_2026_draft', 'settlement_2026-06', '2026-06', '999.00'),
      createMonthlyAllocation('a_2027_01', 'settlement_2027-01', '2027-01', '700.00'),
    ]
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: [],
      monthlySettlements: settlements,
      monthlyAllocations: allocations,
      dividendPayments: [],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }
    const summary = calculateAnnualSummary(data, 2026)
    const partner = summary.find((row) => row.memberId === 'm_partner')

    expect(partner?.partnerProfit).toBe('300.00')
    expect(partner?.totalDividend).toBe('300.00')
  })

  it('keeps dividend payment attribution by year even when payment date is next year', () => {
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: [],
      monthlySettlements: [],
      monthlyAllocations: [],
      dividendPayments: [
        {
          id: 'payment_cross_year',
          memberId: 'm_partner',
          year: 2026,
          payableAmount: '1000.00',
          paidAmount: '500.00',
          unpaidAmount: '500.00',
          paymentDate: '2027-01-10',
          paymentMethod: 'bank_transfer',
          note: '',
          status: 'active',
          createdAt: '2027-01-10T00:00:00.000Z',
          updatedAt: '2027-01-10T00:00:00.000Z',
        },
      ],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }

    const summary2026 = calculateAnnualSummary(data, 2026)
    const summary2027 = calculateAnnualSummary(data, 2027)

    expect(summary2026.find((row) => row.memberId === 'm_partner')?.paidAmount).toBe('500.00')
    expect(summary2027.find((row) => row.memberId === 'm_partner')?.paidAmount).toBe('0.00')
  })

  it('uses locked settlements only', () => {
    const settlement: MonthlySettlement = {
      id: 'settlement_2026-01',
      month: '2026-01',
      status: 'locked',
      allocationMode: 'auto_partner_rate',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerRate: '0.005',
      partnerAnnualRate: '0.06',
      partnerMonthlyRateSnapshot: '0.005',
      rateBasis: 'annual_simple',
      rateConversionMethod: 'divide_by_12',
      retainedRate: '0',
      totalCapital: '1000000.00',
      totalProfit: '25000.00',
      managerProfit: '20000.00',
      partnerProfitPool: '5000.00',
      retainedProfit: '0.00',
      retainedHandling: '',
      roundingAdjustmentAmount: '0.00',
      roundingAdjustmentTarget: 'manager',
      externalPayableProfit: '0.00',
      managerTheoreticalProfit: '23000.00',
      theoreticalTotalProfit: '25000.00',
      actualReconciliationStatus: 'not_entered',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const draftSettlement: MonthlySettlement = {
      ...settlement,
      id: 'settlement_2026-02',
      month: '2026-02',
      status: 'draft',
    }
    const allocations: MonthlyAllocation[] = [
      {
        id: 'a1',
        settlementId: 'settlement_2026-01',
        month: '2026-01',
        memberId: 'm_manager',
        memberName: '张三',
        memberRole: 'manager',
        memberCapital: '600000.00',
        capitalRatio: '0.6',
        partnerProfit: '3000.00',
        managerProfit: '20000.00',
        monthlyProfit: '23000.00',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as MonthlyAllocation,
      {
        id: 'a2',
        settlementId: 'settlement_2026-02',
        month: '2026-02',
        memberId: 'm_manager',
        memberName: '张三',
        memberRole: 'manager',
        memberCapital: '600000.00',
        capitalRatio: '0.6',
        partnerProfit: '3000.00',
        managerProfit: '20000.00',
        monthlyProfit: '23000.00',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      } as MonthlyAllocation,
    ]
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: transactions,
      monthlySettlements: [settlement, draftSettlement],
      monthlyAllocations: allocations,
      dividendPayments: [
        {
          id: 'p1',
          memberId: 'm_manager',
          year: 2026,
          payableAmount: '23000.00',
          paidAmount: '5000.00',
          unpaidAmount: '18000.00',
          paymentDate: '2026-12-31',
          paymentMethod: 'bank_transfer',
          status: 'active',
          paidAt: '2026-12-31',
          amount: '5000',
          note: '',
          createdAt: '2026-12-31T00:00:00.000Z',
          updatedAt: '2026-12-31T00:00:00.000Z',
        },
      ],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }

    const summary = calculateAnnualSummary(data, 2026)
    const manager = summary.find((row) => row.memberId === 'm_manager')

    expect(manager?.totalDividend).toBe('23000.00')
    expect(manager?.paidAmount).toBe('5000.00')
    expect(manager?.unpaidAmount).toBe('18000.00')
  })

  it('sums retained profit from locked settlements only', () => {
    const lockedSettlement: MonthlySettlement = {
      id: 'settlement_2026-03',
      month: '2026-03',
      status: 'locked',
      allocationMode: 'manual_all_rates',
      totalRate: '0.03',
      managerRate: '0.02',
      partnerRate: '0.005',
      partnerAnnualRate: '0.06',
      partnerMonthlyRateSnapshot: '0.005',
      rateBasis: 'annual_simple',
      rateConversionMethod: 'divide_by_12',
      retainedRate: '0.005',
      totalCapital: '1000000.00',
      totalProfit: '30000.00',
      managerProfit: '20000.00',
      partnerProfitPool: '5000.00',
      retainedProfit: '5000.00',
      retainedHandling: 'company_retained',
      roundingAdjustmentAmount: '0.00',
      roundingAdjustmentTarget: 'manager',
      externalPayableProfit: '0.00',
      managerTheoreticalProfit: '0.00',
      theoreticalTotalProfit: '30000.00',
      actualReconciliationStatus: 'not_entered',
      note: '',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    }
    const draftSettlement: MonthlySettlement = {
      ...lockedSettlement,
      id: 'settlement_2026-04',
      month: '2026-04',
      status: 'draft',
      retainedProfit: '7000.00',
    }
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: transactions,
      monthlySettlements: [lockedSettlement, draftSettlement],
      monthlyAllocations: [],
      dividendPayments: [],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }

    expect(calculateAnnualRetainedProfit(data, 2026)).toBe('5000.00')
  })

  it('includes rounding adjustment in annual manager totals for new locked months', () => {
    const calculated = calculateMonthlySettlement({
      members,
      capitalTransactions: [],
      capitalLots: [
        createCapitalLot('lot_manager_rounding_annual', 'm_manager', '100000', 'active'),
        createCapitalLot('lot_partner_rounding_a', 'm_partner', '33.5', 'active'),
        createCapitalLot('lot_partner_rounding_b', 'm_partner', '33.5', 'active'),
        createCapitalLot('lot_partner_rounding_c', 'm_partner', '33.5', 'active'),
      ],
      month: '2026-01',
      totalRate: '0.01',
      managerRate: '0',
      partnerAnnualRate: '0.12',
      settlementId: 'settlement_2026-01',
    })
    const settlement: MonthlySettlement = {
      ...calculated.settlement,
      id: 'settlement_2026-01',
      status: 'locked',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-31T00:00:00.000Z',
    }
    const allocations: MonthlyAllocation[] = calculated.allocations.map((allocation) => ({
      ...allocation,
      id: `rounding_${allocation.capitalLotId}`,
      settlementId: settlement.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-31T00:00:00.000Z',
    }))
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: [],
      monthlySettlements: [settlement],
      monthlyAllocations: allocations,
      dividendPayments: [],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }
    const summary = calculateAnnualSummaryResult(data, 2026)
    const manager = summary.rows.find((row) => row.memberId === 'm_manager')

    expect(summary.roundingAdjustmentAmount).toBe('-0.01')
    expect(summary.managerTheoreticalProfit).toBe('999.99')
    expect(manager?.totalDividend).toBe('999.99')
    expect(manager?.managerProfit).toBe('-0.01')
  })

  it('shows adjustment records separately and includes member adjustments in payable totals', () => {
    const calculated = calculateMonthlySettlement({
      members,
      capitalTransactions: transactions,
      month: '2026-01',
      totalRate: '0.025',
      managerRate: '0.02',
      settlementId: 'settlement_2026-01',
    })
    const settlement: MonthlySettlement = {
      ...calculated.settlement,
      id: 'settlement_2026-01',
      status: 'adjusted',
      note: '',
      lockedAt: '2026-01-31T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-31T00:00:00.000Z',
    }
    const allocations: MonthlyAllocation[] = calculated.allocations.map((allocation) => ({
      ...allocation,
      id: `a_${allocation.capitalLotId}`,
      settlementId: settlement.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-31T00:00:00.000Z',
    }))
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: transactions,
      monthlySettlements: [settlement],
      monthlyAllocations: allocations,
      dividendPayments: [],
      adjustmentRecords: [
        {
          id: 'adj1',
          targetMonth: '2026-01',
          adjustmentMonth: '2026-12',
          memberId: 'm_partner',
          type: 'profit_adjustment',
          amount: '300',
          reason: '补差',
          createdAt: '2026-12-01T00:00:00.000Z',
          updatedAt: '2026-12-01T00:00:00.000Z',
        },
        {
          id: 'adj2',
          targetMonth: '2026-01',
          adjustmentMonth: '2026-12',
          type: 'note_adjustment',
          amount: '0',
          reason: '说明',
          createdAt: '2026-12-01T00:00:00.000Z',
          updatedAt: '2026-12-01T00:00:00.000Z',
        },
      ],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }

    const summary = calculateAnnualSummaryResult(data, 2026)
    const partner = summary.rows.find((row) => row.memberId === 'm_partner')

    expect(summary.annualAdjustmentAmount).toBe('300.00')
    expect(summary.unassignedAdjustmentAmount).toBe('0.00')
    expect(partner?.partnerProfit).toBe('2000.00')
    expect(partner?.adjustmentAmount).toBe('300.00')
    expect(partner?.totalDividend).toBe('2300.00')
    expect(partner?.unpaidAmount).toBe('2300.00')
  })

  it('sums annual manager actual net profit from locked settlements only', () => {
    const lockedSettlement: MonthlySettlement = {
      id: 'settlement_2026-01',
      month: '2026-01',
      status: 'locked',
      allocationMode: 'auto_partner_rate',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerRate: '0.005',
      partnerAnnualRate: '0.06',
      partnerMonthlyRateSnapshot: '0.005',
      rateBasis: 'annual_simple',
      rateConversionMethod: 'divide_by_12',
      retainedRate: '0',
      totalCapital: '1000000.00',
      totalProfit: '25000.00',
      managerProfit: '20000.00',
      partnerProfitPool: '5000.00',
      retainedProfit: '0.00',
      retainedHandling: '',
      roundingAdjustmentAmount: '0.00',
      roundingAdjustmentTarget: 'manager',
      actualDistributableIncome: '24000.00',
      externalPayableProfit: '2000.00',
      managerTheoreticalProfit: '23000.00',
      managerActualNetProfit: '22000.00',
      theoreticalTotalProfit: '25000.00',
      actualIncomeDiff: '-1000.00',
      managerNetDiff: '-1000.00',
      actualReconciliationStatus: 'confirmed',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const draftSettlement: MonthlySettlement = {
      ...lockedSettlement,
      id: 'settlement_2026-02',
      month: '2026-02',
      status: 'draft',
      managerActualNetProfit: '999999.00',
    }
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: transactions,
      monthlySettlements: [lockedSettlement, draftSettlement],
      monthlyAllocations: [],
      dividendPayments: [],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }

    const summary = calculateAnnualSummaryResult(data, 2026)

    expect(summary.managerTheoreticalProfit).toBe('23000.00')
    expect(summary.managerActualNetProfit).toBe('22000.00')
    expect(summary.managerNetDiff).toBe('-1000.00')
  })

  it('derives legacy manager theoretical profit from locked allocations after normalization', () => {
    const legacySettlement: MonthlySettlement = {
      id: 'settlement_2026-01',
      month: '2026-01',
      status: 'locked',
      allocationMode: 'auto_partner_rate',
      totalRate: '0.025',
      managerRate: '0.02',
      partnerRate: '0.005',
      partnerAnnualRate: '0.06',
      partnerMonthlyRateSnapshot: '0.005',
      rateBasis: 'annual_simple',
      rateConversionMethod: 'divide_by_12',
      retainedRate: '0',
      totalCapital: '1000000.00',
      totalProfit: '25000.00',
      managerProfit: '20000.00',
      partnerProfitPool: '5000.00',
      retainedProfit: '0.00',
      retainedHandling: '',
      roundingAdjustmentAmount: '0.00',
      roundingAdjustmentTarget: 'manager',
      externalPayableProfit: '0.00',
      managerTheoreticalProfit: '20000.00',
      theoreticalTotalProfit: '25000.00',
      actualReconciliationStatus: 'not_entered',
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const data: AppData = {
      members,
      capitalLots: [],
      capitalTransactions: transactions,
      monthlySettlements: [legacySettlement],
      monthlyAllocations: [
        {
          id: 'a1',
          settlementId: 'settlement_2026-01',
          month: '2026-01',
          memberId: 'm_manager',
          memberName: 'manager',
          memberRole: 'manager',
          memberCapital: '600000.00',
          capitalRatio: '0.6',
          partnerProfit: '3000.00',
          managerProfit: '20000.00',
          monthlyProfit: '23000.00',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as MonthlyAllocation,
      ],
      dividendPayments: [],
      adjustmentRecords: [],
      annualDividendConfirmations: [],
      operationLogs: [],
      profitCalculatorRecords: [],
    }

    const summary = calculateAnnualSummaryResult(data, 2026)

    expect(summary.managerTheoreticalProfit).toBe('23000.00')
  })
})

function createPayment(id: string, paidAmount: string, status: DividendPayment['status'] = 'active'): DividendPayment {
  return {
    id,
    memberId: 'm_partner',
    year: 2026,
    payableAmount: '2300.00',
    paidAmount,
    unpaidAmount: '0.00',
    paymentDate: '2026-12-31',
    paymentMethod: 'bank_transfer',
    note: '',
    status,
    createdAt: '2026-12-31T00:00:00.000Z',
    updatedAt: '2026-12-31T00:00:00.000Z',
  }
}

function createProfitCalculatorRecord(): ProfitCalculatorRecord {
  return {
    id: 'calculator_1',
    memberId: 'm_partner',
    investmentAmount: '100000',
    annualRate: '0.06',
    monthlyRate: '0.005',
    startDate: '2026-07-15',
    settlementCycleMonths: '12',
    settlementYear: '2026',
    calculatorMode: 'calendar_year',
    periodStartDate: '2026-01-01',
    periodEndDate: '2026-12-31',
    firstMonthDays: 31,
    firstMonthInterestDays: 17,
    firstMonthProfit: '274.19',
    fullMonthCount: '5',
    fullMonthProfit: '2500.00',
    totalProfit: '2774.19',
    principalPlusProfit: '102774.19',
    note: '年度试算',
    recordType: 'calculator_record',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  }
}

function createClosedLoopData(dividendPayments: DividendPayment[] = []): AppData {
  const calculated = calculateMonthlySettlement({
    members,
    capitalTransactions: transactions,
    month: '2026-01',
    totalRate: '0.025',
    managerRate: '0.02',
    settlementId: 'settlement_2026-01',
  })
  const settlement: MonthlySettlement = {
    ...calculated.settlement,
    id: 'settlement_2026-01',
    status: 'locked',
    note: '',
    lockedAt: '2026-01-31T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-31T00:00:00.000Z',
  }
  const allocations: MonthlyAllocation[] = calculated.allocations.map((allocation) => ({
    ...allocation,
    id: `closed_${allocation.capitalLotId}`,
    settlementId: settlement.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-31T00:00:00.000Z',
  }))

  return {
    members,
    capitalLots: [],
    capitalTransactions: transactions,
    monthlySettlements: [settlement],
    monthlyAllocations: allocations,
    dividendPayments,
    adjustmentRecords: [
      {
        id: 'adj_closed',
        targetMonth: '2026-01',
        adjustmentMonth: '2026-12',
        memberId: 'm_partner',
        type: 'profit_adjustment',
        amount: '300',
        reason: '年底补差',
        createdAt: '2026-12-01T00:00:00.000Z',
        updatedAt: '2026-12-01T00:00:00.000Z',
      },
    ],
    annualDividendConfirmations: [],
    operationLogs: [
      {
        id: 'op1',
        action: 'monthly_settlement_locked',
        entityType: 'monthlySettlement',
        entityId: 'settlement_2026-01',
        createdAt: '2026-01-31T00:00:00.000Z',
      },
    ],
    profitCalculatorRecords: [],
  }
}

describe('closed-loop annual detail and exports', () => {
  it('calculates member annual detail from locked months and adjustments', () => {
    const detail = calculateMemberAnnualDetail(createClosedLoopData(), 'm_partner', 2026)

    expect(detail.partnerProfit).toBe('2000.00')
    expect(detail.adjustmentAmount).toBe('300.00')
    expect(detail.totalDividend).toBe('2300.00')
    expect(detail.paidAmount).toBe('0.00')
    expect(detail.unpaidAmount).toBe('2300.00')
    expect(detail.monthlyDetails).toEqual([
      expect.objectContaining({
        month: '2026-01',
        totalDividend: '2000.00',
      }),
    ])
  })

  it('generates annual confirmation amounts from locked months plus adjustments', () => {
    const confirmations = calculateAnnualDividendConfirmationDrafts(createClosedLoopData(), 2026)
    const partner = confirmations.find((row) => row.memberId === 'm_partner')

    expect(partner?.payableAmount).toBe('2300.00')
    expect(partner?.adjustmentAmount).toBe('300.00')
    expect(partner?.status).toBe('not_generated')
  })

  it('calculates unpaid amount after partial payment', () => {
    const detail = calculateMemberAnnualDetail(createClosedLoopData([createPayment('p1', '500')]), 'm_partner', 2026)

    expect(detail.paidAmount).toBe('500.00')
    expect(detail.unpaidAmount).toBe('1800.00')
  })

  it('uses manager theoretical dividend as the dividend payment payable basis', () => {
    const managerRow: AnnualSummaryRow = {
      memberId: 'm_manager',
      memberName: '张三',
      memberRole: 'manager',
      partnerProfit: '2500.00',
      managerProfit: '2222.22',
      actualNetProfit: '7555.55',
      adjustmentAmount: '100.00',
      totalDividend: '4722.22',
      paidAmount: '4000.00',
      unpaidAmount: '722.22',
    }
    const partnerRow: AnnualSummaryRow = {
      memberId: 'm_partner',
      memberName: '李四',
      memberRole: 'partner',
      partnerProfit: '2300.00',
      managerProfit: '0.00',
      actualNetProfit: '0.00',
      adjustmentAmount: '300.00',
      totalDividend: '2300.00',
      paidAmount: '500.00',
      unpaidAmount: '1800.00',
    }

    expect(annualDividendPaymentBasisLabel(managerRow)).toBe('负责人年度理论收益 + 调整金额')
    expect(annualDividendPaymentPayableAmount(managerRow)).toBe('4722.22')
    expect(annualDividendPaymentUnpaidAmount(managerRow)).toBe('722.22')
    expect(annualDividendPaymentBasisLabel(partnerRow)).toBe('年度应分红')
    expect(annualDividendPaymentPayableAmount(partnerRow)).toBe('2300.00')
    expect(annualDividendPaymentUnpaidAmount(partnerRow)).toBe('1800.00')
  })

  it('calculates unpaid amount after multiple payments', () => {
    const detail = calculateMemberAnnualDetail(
      createClosedLoopData([createPayment('p1', '500'), createPayment('p2', '700')]),
      'm_partner',
      2026,
    )

    expect(detail.paidAmount).toBe('1200.00')
    expect(detail.unpaidAmount).toBe('1100.00')
  })

  it('restores unpaid amount when a payment record is voided', () => {
    const detail = calculateMemberAnnualDetail(
      createClosedLoopData([createPayment('p1', '500', 'void')]),
      'm_partner',
      2026,
    )

    expect(detail.paidAmount).toBe('0.00')
    expect(detail.unpaidAmount).toBe('2300.00')
  })

  it('does not mutate data when exporting CSV', () => {
    const data = createClosedLoopData([createPayment('p1', '500')])
    const before = JSON.stringify(data)

    buildAnnualSummaryCsv(data, 2026)
    buildMemberAnnualDetailCsv(data, 'm_partner', 2026)
    buildMemberDividendSlipCsv(data, 'm_partner', 2026)

    expect(JSON.stringify(data)).toBe(before)
  })

  it('exports a privacy-friendly individual dividend slip for one partner', () => {
    const csv = buildMemberDividendSlipCsv(createClosedLoopData([createPayment('p1', '500')]), 'm_partner', 2026)

    expect(csv).toContain('合伙人个人分红条')
    expect(csv).toContain('李四')
    expect(csv).toContain('本人核算开始日')
    expect(csv).toContain('本人核算截止日')
    expect(csv).toContain('参与月份数')
    expect(csv).toContain('个人分红汇总')
    expect(csv).toContain('年度应分红')
    expect(csv).toContain('2300.00')
    expect(csv).toContain('已支付金额')
    expect(csv).toContain('500.00')
    expect(csv).toContain('待支付金额')
    expect(csv).toContain('1800.00')
    expect(csv).toContain('本人月度分红简表')
    expect(csv).not.toContain('个人支付记录')
    expect(csv).not.toContain('支付日期')
    expect(csv).not.toContain('当前有效本金')
    expect(csv).not.toContain('年度实际净收益')
    expect(csv).not.toContain('张三')
    expect(csv).not.toContain('monthlyAllocations')
    expect(csv).not.toContain('partnerAnnualRate')
    expect(csv).not.toContain('bank_transfer')
  })

  it('uses the member actual participating period in the individual dividend slip', () => {
    const csv = buildMemberDividendSlipCsv(createClosedLoopData([createPayment('p1', '500')]), 'm_partner', 2026)

    expect(csv).toContain('本人核算开始日,2026年1月1日')
    expect(csv).toContain('本人核算截止日,2026年1月31日')
    expect(csv).toContain('参与月份数,1个月')
    expect(csv).toContain('提前退出不按全年展示')
    expect(csv).not.toContain('统计截止日,2026年12月31日')
  })

  it('keeps core amounts stable after JSON export and import', () => {
    const data = createClosedLoopData([createPayment('p1', '500')])
    const parsed = parseJsonImport(buildJsonExport(data))
    const detail = calculateMemberAnnualDetail(parsed, 'm_partner', 2026)

    expect(detail.totalDividend).toBe('2300.00')
    expect(detail.paidAmount).toBe('500.00')
    expect(detail.unpaidAmount).toBe('1800.00')
  })

  it('preserves operation logs in JSON backup data', () => {
    const parsed = parseJsonImport(buildJsonExport(createClosedLoopData()))

    expect(parsed.operationLogs).toEqual([
      expect.objectContaining({
        action: 'monthly_settlement_locked',
        entityType: 'monthlySettlement',
      }),
    ])
  })

  it('exports annual confirmation with partner annual rate instead of only monthly rate', () => {
    const csv = buildAnnualDividendConfirmationsCsv(createClosedLoopData(), 2026)

    expect(csv).toContain('普通合伙人年化收益率')
    expect(csv).toContain('折合月收益率')
    expect(csv).toContain('6.00%')
    expect(csv).toContain('0.50%')
  })

  it('matches the profit calculator and settlement annual-rate calculation', () => {
    const calculatorResult = calculateProfitCalculator({
      investmentAmount: '100000',
      annualRate: '0.06',
      startDate: '2026-07-15',
      settlementCycleMonths: '1',
    })
    const settlementProfit = calculatePartnerProfitByAnnualRate({
      originalCapital: '100000',
      partnerAnnualRate: '0.06',
      interestDays: 17,
      daysInMonth: 31,
    })

    expect(calculatorResult.monthlyRate).toBe('0.005')
    expect(calculatorResult.totalProfit).toBe(settlementProfit)
  })

  it('formats user-facing dates, amounts and status labels in Chinese', () => {
    expect(formatDate('2026-07-15')).toBe('2026年7月15日')
    expect(formatMoney('100000')).toBe('100,000.00')
    expect(formatMoney('12345678901234567890.12')).toBe('12,345,678,901,234,567,890.12')
    expect(formatMoney('-1234567.89')).toBe('-1,234,567.89')
    expect(formatMoney('0')).toBe('0.00')
    expect(formatMoney('1234.567')).toBe('1,234.57')
    expect(formatMoney('不是金额')).toBe('0.00')
    expect(settlementStatusLabels.locked).toBe('已锁定')
    expect(operationActionLabel('monthly_settlement_locked')).toBe('锁定月度结算')
  })

  it('builds Chinese export file names and sanitizes unsafe characters', () => {
    const backupName = buildBackupFileName(new Date(2026, 6, 15, 21, 30))
    const memberFileName = memberAnnualDetailFileName('张/三:*?', 2026)

    expect(backupName).toBe('合伙人收益系统备份-2026年07月15日-2130.json')
    expect(annualSummaryFileName(2026)).toBe('年度分红汇总-2026.csv')
    expect(annualSummaryXlsxFileName(2026)).toBe('年度分红汇总-2026.xlsx')
    expect(dividendPaymentsFileName(2026)).toBe('分红支付记录-2026.csv')
    expect(dividendPaymentsXlsxFileName(2026)).toBe('分红支付记录-2026.xlsx')
    expect(monthlySettlementFileName(2026)).toBe('月度结算明细-2026年.csv')
    expect(monthlySettlementXlsxFileName('2026-07')).toBe('月度结算明细-2026年7月.xlsx')
    expect(operationLogsFileName(2026)).toBe('操作日志-2026.csv')
    expect(operationLogsXlsxFileName(2026)).toBe('操作日志-2026.xlsx')
    expect(memberDividendSlipFileName('张/三:*?', 2026)).toBe('合伙人个人分红条-张-三----2026.csv')
    expect(memberAnnualDetailXlsxFileName('张/三:*?', 2026)).toBe('合伙人年度明细-张-三----2026.xlsx')
    expect(memberFileName).toBe('合伙人年度明细-张-三----2026.csv')
    expect(memberFileName).not.toContain('member-detail')
    expect(
      memberFileName
        .split('')
        .some((char) => ['<', '>', ':', '"', '/', '\\', '|', '?', '*'].includes(char) || char.charCodeAt(0) < 32),
    ).toBe(false)
  })

  it('guards unsafe full-data replacement for demo data only', () => {
    const emptyCounts = coreBusinessDataCounts({
      ...createClosedLoopData(),
      members: [],
      capitalLots: [],
      monthlySettlements: [],
      monthlyAllocations: [],
      dividendPayments: [],
    })

    expect(() =>
      assertCanUnsafeReplaceAllDataForDemoOnly(emptyCounts, { confirmDangerousReplace: true }),
    ).not.toThrow()
    expect(() => assertCanUnsafeReplaceAllDataForDemoOnly(emptyCounts)).toThrow(
      '全量替换属于高风险操作，必须显式确认后才能执行。',
    )
    expect(() =>
      assertCanUnsafeReplaceAllDataForDemoOnly({ ...emptyCounts, members: 1 }, { confirmDangerousReplace: true }),
    ).toThrow('检测到当前系统已有数据，已阻止全量替换操作。')
    expect(() =>
      assertCanUnsafeReplaceAllDataForDemoOnly(
        { ...emptyCounts, monthlySettlements: 1 },
        { confirmDangerousReplace: true },
      ),
    ).toThrow('检测到当前系统已有数据，已阻止全量替换操作。')
  })

  it('exports monthly settlement CSV with Chinese headers and labels', () => {
    const csv = buildMonthlySettlementCsv(createClosedLoopData(), 2026)

    expect(csv).toContain('普通合伙人年化收益率')
    expect(csv).toContain('折合月收益率')
    expect(csv).toContain('外部资金差额留存')
    expect(csv).toContain('尾差调整')
    expect(csv).toContain('尾差归属')
    expect(csv).toContain('已锁定')
    expect(csv).toContain('整月计息')
    expect(csv).toContain('2026年1月')
    expect(csv).not.toContain('partnerAnnualRate')
    expect(csv).not.toContain('partnerMonthlyRateSnapshot')
    expect(csv).not.toContain('actualDistributableNetIncome')
    expect(csv).not.toContain('roundingAdjustmentAmount')
    expect(csv).not.toContain('locked')
  })

  it('exports annual confirmation and payment CSV with Chinese user-facing fields', () => {
    const data = createClosedLoopData([createPayment('p1', '500')])
    const confirmationCsv = buildAnnualDividendConfirmationsCsv(data, 2026)
    const paymentCsv = buildDividendPaymentsCsv(data, 2026)

    expect(confirmationCsv).toContain('确认状态')
    expect(confirmationCsv).toContain('未生成')
    expect(confirmationCsv).not.toContain('not_generated')
    expect(paymentCsv).toContain('支付日期')
    expect(paymentCsv).toContain('生效中')
    expect(paymentCsv).toContain('银行转账')
    expect(paymentCsv).toContain('2026年12月31日')
    expect(paymentCsv).not.toContain('bank_transfer')
    expect(paymentCsv).not.toContain('active')
  })

  it('exports annual CSV reports with Gregorian natural-year period fields', () => {
    const data = createClosedLoopData([createPayment('p1', '500')])
    const annualCsv = buildAnnualSummaryCsv(data, 2026)
    const memberCsv = buildMemberAnnualDetailCsv(data, 'm_partner', 2026)
    const confirmationCsv = buildAnnualDividendConfirmationsCsv(data, 2026)
    const paymentCsv = buildDividendPaymentsCsv(data, 2026)

    for (const csv of [annualCsv, memberCsv, confirmationCsv, paymentCsv]) {
      expect(csv).toContain('分红年度')
      expect(csv).toContain('统计开始日')
      expect(csv).toContain('统计截止日')
      expect(csv).toContain('年度周期')
      expect(csv).toContain('公历自然年度')
      expect(csv).not.toContain('periodStartDate')
      expect(csv).not.toContain('periodEndDate')
    }
  })

  it('exports operation logs without English action or entity names', () => {
    const csv = buildOperationLogsCsv(createClosedLoopData())

    expect(csv).toContain('操作时间,操作内容,业务对象,关联记录,备注')
    expect(csv).toContain('锁定月度结算')
    expect(csv).toContain('月度结算')
    expect(csv).toContain('2026年1月')
    expect(csv).not.toContain('monthly_settlement_locked')
    expect(csv).not.toContain('monthlySettlement')
    expect(csv).not.toContain('settlement_2026-01')
  })

  it('exports profit calculator records CSV with Chinese headers', () => {
    const data = {
      ...createClosedLoopData(),
      profitCalculatorRecords: [createProfitCalculatorRecord()],
    }
    const csv = buildProfitCalculatorRecordsCsv(data, 2026)

    expect(csv).toContain('创建时间,关联合伙人,测算模式,投资金额,年化收益率,折合月收益率')
    expect(csv).toContain('自然年度清算')
    expect(csv).toContain('100,000.00')
    expect(csv).toContain('6.00%')
    expect(csv).toContain('0.50%')
    expect(csv).toContain('2,774.19')
    expect(csv).not.toContain('annualRate')
    expect(csv).not.toContain('monthlyRate')
    expect(csv).not.toContain('calculator_record')
    expect(profitCalculatorRecordsFileName(2026)).toBe('收益计算器记录-2026.csv')
  })

  it('classifies Excel message tones without false risk styles', () => {
    expect(classifyExcelMessageTone(['未发现收入覆盖风险。'])).toBe('normal')
    expect(classifyExcelMessageTone(['本月实际可分配净收入不足以覆盖对外合伙人应付收益'])).toBe('risk')
    expect(classifyExcelMessageTone(['差额过大，请补充备注'])).toBe('warning')
    expect(classifyExcelMessageTone(['导出完成'])).toBe('normal')
  })

  it('builds XLSX report definitions with Chinese sheets and headers', () => {
    const data = {
      ...createClosedLoopData([createPayment('p1', '500')]),
      profitCalculatorRecords: [createProfitCalculatorRecord()],
    }
    const reports = [
      buildMonthlySettlementXlsxReport(data, '2026-01'),
      buildAnnualSummaryXlsxReport(data, 2026),
      buildMemberAnnualDetailXlsxReport(data, 'm_partner', 2026),
      buildAnnualDividendConfirmationsXlsxReport(data, 2026),
      buildDividendPaymentsXlsxReport(data, 2026),
      buildOperationLogsXlsxReport(data, 2026),
      buildProfitCalculatorRecordsXlsxReport(data, 2026),
    ]
    const reportText = JSON.stringify(reports)

    expect(reports.map((report) => report.fileName)).toEqual([
      '月度结算明细-2026年1月.xlsx',
      '年度分红汇总-2026.xlsx',
      '合伙人年度明细-李四-2026.xlsx',
      '年度分红确认单-2026.xlsx',
      '分红支付记录-2026.xlsx',
      '操作日志-2026.xlsx',
      '收益计算器记录-2026.xlsx',
    ])
    expect(reportText).toContain('月度结算摘要')
    expect(reportText).toContain('年度总览')
    expect(reportText).toContain('个人年度摘要')
    expect(reportText).toContain('确认单明细')
    expect(reportText).toContain('支付汇总')
    expect(reportText).toContain('操作日志')
    expect(reportText).toContain('测算记录')
    expect(reportText).toContain('普通合伙人年化收益率')
    expect(reportText).toContain('折合月收益率')
    expect(reportText).toContain('2,300.00')
    expect(reportText).toContain('6.00%')
    expect(reportText).not.toContain('partnerAnnualRate')
    expect(reportText).not.toContain('monthlyTotalRate')
    expect(reportText).not.toContain('actualDistributableNetIncome')
    expect(reportText).not.toContain('monthlyAllocations')
    expect(reportText).not.toContain('dividendPayments')
    expect(reportText).not.toContain('locked')
    expect(reportText).not.toContain('draft')
  })

  it('writes common XLSX money and rate cells as numeric values while preserving huge amounts as text', async () => {
    const { Workbook } = await import('exceljs')
    const buffer = await buildExcelReportBuffer({
      fileName: '测试.xlsx',
      title: '测试',
      sheets: [
        {
          name: '格式检查',
          tables: [
            {
              headers: ['普通金额', '年化收益率', '超大金额', '负数金额'],
              rows: [['100,000.00', '6.00%', '12,345,678,901,234,567,890.12', '-1,234.56']],
            },
          ],
        },
      ],
    })
    const workbook = new Workbook()

    await workbook.xlsx.load(buffer as ArrayBuffer)

    const worksheet = workbook.getWorksheet('格式检查')

    expect(worksheet?.getCell('A3').value).toBe(100000)
    expect(worksheet?.getCell('A3').numFmt).toBe('#,##0.00;[Red]-#,##0.00')
    expect(worksheet?.getCell('B3').value).toBeCloseTo(0.06)
    expect(worksheet?.getCell('B3').numFmt).toBe('0.00%')
    expect(worksheet?.getCell('C3').value).toBe('12,345,678,901,234,567,890.12')
    expect(worksheet?.getCell('D3').value).toBe(-1234.56)
    expect(worksheet?.getCell('D3').numFmt).toBe('#,##0.00;[Red]-#,##0.00')
  }, 15000)

  it('keeps XLSX annual summary amount cells consistent with calculated values', async () => {
    const { Workbook } = await import('exceljs')
    const buffer = await buildExcelReportBuffer(buildAnnualSummaryXlsxReport(createClosedLoopData(), 2026))
    const workbook = new Workbook()

    await workbook.xlsx.load(buffer as ArrayBuffer)

    const partnerSummary = workbook.getWorksheet('合伙人汇总')
    let partnerRow: import('exceljs').Row | undefined

    partnerSummary?.eachRow((row) => {
      if (row.getCell(1).value === '李四') {
        partnerRow = row
      }
    })

    expect(partnerRow?.getCell(3).value).toBe(2300)
    expect(partnerRow?.getCell(3).numFmt).toBe('#,##0.00;[Red]-#,##0.00')
  }, 15000)

  it('generates a readable XLSX workbook buffer', async () => {
    const { Workbook } = await import('exceljs')
    const buffer = await buildExcelReportBuffer(buildAnnualSummaryXlsxReport(createClosedLoopData(), 2026))
    const workbook = new Workbook()

    await workbook.xlsx.load(buffer as ArrayBuffer)

    const overview = workbook.getWorksheet('年度总览')
    const partnerSummary = workbook.getWorksheet('合伙人汇总')

    expect(overview).toBeDefined()
    expect(partnerSummary).toBeDefined()
    expect(overview?.getCell('A1').value).toBe('2026 年度分红总览')
    expect(partnerSummary?.getRow(2).values).toContain('合伙人')
    expect(partnerSummary?.getRow(2).values).toContain('年度应分红')
  }, 15000)

  it('returns Chinese import errors without exposing schema field names', () => {
    expect(() => parseJsonImport('{"schemaVersion":999}')).toThrow(
      '导入备份文件的数据版本不受支持，请使用本系统导出的备份文件。',
    )

    try {
      parseJsonImport('{"schemaVersion":999}')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).not.toContain('schemaVersion')
    }
  })
})
