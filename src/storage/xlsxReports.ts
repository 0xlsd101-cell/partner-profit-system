import {
  annualDividendPaymentBasisLabel,
  annualDividendPaymentPayableAmount,
  annualDividendPaymentUnpaidAmount,
  calculateAnnualDividendConfirmationDrafts,
  calculateAnnualSummaryResult,
  calculateMemberAnnualDetail,
  daysInNaturalMonth,
  getAnnualPeriod,
  isMonthInAnnualPeriod,
  normalizeDividendPayment,
  normalizeMonthlySettlement,
} from '../domain/calculation'
import type {
  AppData,
  CapitalLot,
  Member,
  MonthlyAllocation,
  MonthlySettlement,
  ProfitCalculatorRecord,
} from '../domain/types'
import { decimal } from '../utils/decimal'
import {
  capitalLotStatusLabels,
  dividendPaymentStatusLabels,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMonth,
  formatRate,
  formatRatio,
  operationActionLabel,
  operationEntityText,
  paymentMethodLabel,
  prorationTypeLabels,
  roundingAdjustmentTargetLabels,
  settlementStatusLabels,
} from '../utils/format'
import {
  annualDividendConfirmationsXlsxFileName,
  annualSummaryXlsxFileName,
  dividendPaymentsXlsxFileName,
  memberAnnualDetailXlsxFileName,
  memberDividendSlipXlsxFileName,
  monthlySettlementXlsxFileName,
  monthlySettlementYearXlsxFileName,
  operationLogsXlsxFileName,
  profitCalculatorRecordsXlsxFileName,
} from '../utils/fileName'
import type { ExcelReportDefinition, ExcelSheetDefinition } from '../utils/excelExport'
import { downloadExcelReport } from '../utils/excelExport'

function roleLabel(role: Member['role']): string {
  return role === 'manager' ? '负责人' : '合伙人'
}

function statusLabel(settlement?: Pick<MonthlySettlement, 'status'>): string {
  return settlement ? settlementStatusLabels[settlement.status] : '未创建'
}

function paymentStatusText(totalDividend: string, paidAmount: string, unpaidAmount: string): string {
  if (decimal(totalDividend).lte(0)) {
    return '暂无应付'
  }

  if (decimal(unpaidAmount).lte(0)) {
    return '已支付'
  }

  if (decimal(paidAmount).gt(0)) {
    return '部分支付'
  }

  return '未支付'
}

function isFinalizedSettlement(settlement: MonthlySettlement): boolean {
  return settlement.status === 'locked' || settlement.status === 'adjusted'
}

function annualPeriodText(year: number): string {
  const period = getAnnualPeriod(year)

  return `${formatDate(period.periodStartDate)} 至 ${formatDate(period.periodEndDate)}`
}

function ruleSheet(): ExcelSheetDefinition {
  return {
    name: '规则说明',
    title: '规则说明',
    notes: [
      '本系统采用年化单利收益率，按自然月折算。月收益率 = 年化收益率 ÷ 12。',
      '月中加入首月按实际计息天数折算，后续月份按整月计算。',
      '年度周期采用公历自然年度，每年 1 月 1 日开始，每年 12 月 31 日结束。',
      '年度汇总只统计已锁定或已调整月份，草稿月份不作为正式分红依据。',
      '外部资金差额留存仅基于非负责人折算本金计算。',
      '金额尾差默认归负责人承担或享有。',
      '本报表仅用于人工核对和归档，不修改任何本地账务数据。',
    ],
  }
}

function memberById(data: AppData): Map<string, Member> {
  return new Map(data.members.map((member) => [member.id, member]))
}

function memberName(data: AppData, memberId: string): string {
  return memberById(data).get(memberId)?.name ?? '未知合伙人'
}

function allocationProfit(allocation: MonthlyAllocation): string {
  return allocation.memberRole === 'manager'
    ? allocation.managerOwnCapitalProfit
    : allocation.partnerProfit
}

function calculatorModeLabel(record: ProfitCalculatorRecord): string {
  return record.calculatorMode === 'cycle_months' ? '实际投入月数' : '自然年度清算'
}

function firstParticipationDate(lots: CapitalLot[], year: number): string {
  const firstLot = lots
    .filter((lot) => lot.status !== 'withdrawn' || lot.startDate.slice(0, 4) <= String(year))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  return firstLot ? formatDate(firstLot.startDate) : '-'
}

export function buildMonthlySettlementXlsxReport(data: AppData, month: string): ExcelReportDefinition {
  const settlement = data.monthlySettlements.find((item) => item.month === month)
  const normalized = settlement ? normalizeMonthlySettlement(settlement) : undefined
  const allocations = settlement
    ? data.monthlyAllocations.filter((allocation) => allocation.settlementId === settlement.id)
    : data.monthlyAllocations.filter((allocation) => allocation.month === month)
  const totalEquivalentCapital = allocations.reduce((sum, allocation) => sum.plus(allocation.equivalentCapital), decimal(0))
  const managerEquivalentCapital = allocations
    .filter((allocation) => allocation.memberRole === 'manager')
    .reduce((sum, allocation) => sum.plus(allocation.equivalentCapital), decimal(0))
  const externalEquivalentCapital = totalEquivalentCapital.minus(managerEquivalentCapital)
  const actualRisk =
    normalized?.managerActualNetProfit && decimal(normalized.managerActualNetProfit).lt(0)
      ? '本月实际可分配净收入不足以覆盖对外合伙人应付收益，负责人实际净收益为负数。'
      : '未发现收入覆盖风险。'

  return {
    fileName: monthlySettlementXlsxFileName(month),
    title: `月度结算明细-${formatMonth(month)}`,
    sheets: [
      {
        name: '月度结算摘要',
        title: `月度结算摘要 - ${formatMonth(month)}`,
        summaryRows: [
          ['结算月份', formatMonth(month)],
          ['当月天数', `${daysInNaturalMonth(month)} 天`],
          ['结算状态', statusLabel(settlement)],
          ['本月总折算本金', formatMoney(totalEquivalentCapital.toString())],
          ['负责人折算本金', formatMoney(managerEquivalentCapital.toString())],
          ['非负责人折算本金', formatMoney(externalEquivalentCapital.toString())],
          ['本月总收益率', normalized ? formatRate(normalized.totalRate) : '-'],
          ['普通合伙人年化收益率', normalized ? formatRate(normalized.partnerAnnualRate) : '-'],
          ['折合月收益率', normalized ? formatRate(normalized.partnerMonthlyRateSnapshot) : '-'],
          ['负责人专项月收益率', normalized ? formatRate(normalized.managerRate) : '-'],
          ['本月理论总收益', normalized ? formatMoney(normalized.totalProfit) : '-'],
          ['对外合伙人应付收益', normalized ? formatMoney(normalized.externalPayableProfit) : '-'],
          ['负责人理论收益', normalized ? formatMoney(normalized.managerTheoreticalProfit) : '-'],
          ['本月实际可分配净收入', normalized?.actualDistributableNetIncome ? formatMoney(normalized.actualDistributableNetIncome) : '-'],
          ['负责人实际净收益', normalized?.managerActualNetProfit ? formatMoney(normalized.managerActualNetProfit) : '-'],
          ['外部资金差额留存', normalized ? formatMoney(normalized.retainedProfit) : '-'],
          ['尾差调整', normalized ? formatMoney(normalized.roundingAdjustmentAmount) : '-'],
          ['尾差归属', normalized ? roundingAdjustmentTargetLabels[normalized.roundingAdjustmentTarget] : '-'],
        ],
      },
      {
        name: '资金折算明细',
        title: `资金折算明细 - ${formatMonth(month)}`,
        tables: [
          {
            headers: ['合伙人', '角色', '原始本金', '起息日期', '计息方式', '当月天数', '计息天数', '折算比例', '折算本金', '年化收益率', '折合月收益率', '当月收益', '备注'],
            rows: allocations.map((allocation) => [
              allocation.memberName,
              roleLabel(allocation.memberRole),
              formatMoney(allocation.originalCapital),
              formatDate(allocation.startDate),
              prorationTypeLabels[allocation.prorationType],
              allocation.daysInMonth,
              allocation.interestDays,
              formatRatio(allocation.prorationFactor),
              formatMoney(allocation.equivalentCapital),
              normalized ? formatRate(normalized.partnerAnnualRate) : '-',
              normalized ? formatRate(normalized.partnerMonthlyRateSnapshot) : '-',
              formatMoney(allocationProfit(allocation)),
              '',
            ]),
          },
        ],
      },
      {
        name: '收益分配明细',
        title: `收益分配明细 - ${formatMonth(month)}`,
        tables: [
          {
            headers: ['合伙人', '角色', '普通合伙人收益', '负责人自有资金收益', '负责人专项收益', '当月合计收益'],
            rows: allocations.map((allocation) => [
              allocation.memberName,
              roleLabel(allocation.memberRole),
              formatMoney(allocation.partnerProfit),
              formatMoney(allocation.managerOwnCapitalProfit),
              formatMoney(allocation.managerSpecialProfit),
              formatMoney(allocation.totalProfit),
            ]),
          },
        ],
      },
      {
        name: '实际收入对账',
        title: `实际收入对账 - ${formatMonth(month)}`,
        tables: [
          {
            headers: ['本月实际可分配净收入', '对外合伙人应付收益', '负责人实际净收益', '实际差额', '风险提示', '备注'],
            rows: [
              [
                normalized?.actualDistributableNetIncome ? formatMoney(normalized.actualDistributableNetIncome) : '未录入',
                normalized ? formatMoney(normalized.externalPayableProfit) : '-',
                normalized?.managerActualNetProfit ? formatMoney(normalized.managerActualNetProfit) : '-',
                normalized?.actualIncomeDiff ? formatMoney(normalized.actualIncomeDiff) : '-',
                actualRisk,
                normalized?.actualIncomeNote ?? '',
              ],
            ],
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildMonthlySettlementsYearXlsxReport(data: AppData, year: number): ExcelReportDefinition {
  const settlements = data.monthlySettlements
    .filter((settlement) => isMonthInAnnualPeriod(settlement.month, year))
    .sort((a, b) => a.month.localeCompare(b.month))
  const allocationsBySettlement = new Map<string, MonthlyAllocation[]>()

  for (const allocation of data.monthlyAllocations.filter((allocation) => isMonthInAnnualPeriod(allocation.month, year))) {
    const rows = allocationsBySettlement.get(allocation.settlementId) ?? []
    rows.push(allocation)
    allocationsBySettlement.set(allocation.settlementId, rows)
  }

  return {
    fileName: monthlySettlementYearXlsxFileName(year),
    title: `月度结算明细-${year}年`,
    sheets: [
      {
        name: '月度结算摘要',
        title: `${year} 年月度结算摘要`,
        tables: [
          {
            headers: ['结算月份', '结算状态', '本月理论总收益', '对外合伙人应付收益', '负责人理论收益', '负责人实际净收益', '外部资金差额留存', '尾差调整', '备注'],
            rows: settlements.map((settlement) => {
              const normalized = normalizeMonthlySettlement(settlement)

              return [
                formatMonth(normalized.month),
                settlementStatusLabels[normalized.status],
                formatMoney(normalized.totalProfit),
                formatMoney(normalized.externalPayableProfit),
                formatMoney(normalized.managerTheoreticalProfit),
                normalized.managerActualNetProfit ? formatMoney(normalized.managerActualNetProfit) : '-',
                formatMoney(normalized.retainedProfit),
                formatMoney(normalized.roundingAdjustmentAmount),
                normalized.note,
              ]
            }),
          },
        ],
      },
      {
        name: '资金折算明细',
        title: `${year} 年资金折算明细`,
        tables: [
          {
            headers: ['结算月份', '合伙人', '角色', '原始本金', '起息日期', '计息方式', '当月天数', '计息天数', '折算本金', '年化收益率', '折合月收益率', '当月收益'],
            rows: settlements.flatMap((settlement) => {
              const normalized = normalizeMonthlySettlement(settlement)
              const allocations = allocationsBySettlement.get(settlement.id) ?? []

              return allocations.map((allocation) => [
                formatMonth(allocation.month),
                allocation.memberName,
                roleLabel(allocation.memberRole),
                formatMoney(allocation.originalCapital),
                formatDate(allocation.startDate),
                prorationTypeLabels[allocation.prorationType],
                allocation.daysInMonth,
                allocation.interestDays,
                formatMoney(allocation.equivalentCapital),
                formatRate(normalized.partnerAnnualRate),
                formatRate(normalized.partnerMonthlyRateSnapshot),
                formatMoney(allocationProfit(allocation)),
              ])
            }),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildAnnualSummaryXlsxReport(data: AppData, year: number): ExcelReportDefinition {
  const summary = calculateAnnualSummaryResult(data, year)
  const annualPeriod = getAnnualPeriod(year)
  const finalizedSettlements = data.monthlySettlements.filter(
    (settlement) => isFinalizedSettlement(settlement) && isMonthInAnnualPeriod(settlement.month, year),
  )
  const annualTheoreticalProfit = finalizedSettlements.reduce((sum, settlement) => sum.plus(settlement.totalProfit), decimal(0))
  const annualExternalPayableProfit = finalizedSettlements.reduce(
    (sum, settlement) => sum.plus(settlement.externalPayableProfit ?? 0),
    decimal(0),
  )
  const totalPaid = summary.rows.reduce((sum, row) => sum.plus(row.paidAmount), decimal(0))
  const totalUnpaid = summary.rows.reduce((sum, row) => sum.plus(row.unpaidAmount), decimal(0))

  return {
    fileName: annualSummaryXlsxFileName(year),
    title: `年度分红汇总-${year}`,
    sheets: [
      {
        name: '年度总览',
        title: `${year} 年度分红总览`,
        summaryRows: [
          ['分红年度', `${year} 年`],
          ['统计开始日', formatDate(annualPeriod.periodStartDate)],
          ['统计截止日', formatDate(annualPeriod.periodEndDate)],
          ['年度周期', '公历自然年度'],
          ['年度理论总收益', formatMoney(annualTheoreticalProfit.toString())],
          ['年度对外应付收益', formatMoney(annualExternalPayableProfit.toString())],
          ['负责人年度理论收益', formatMoney(summary.managerTheoreticalProfit)],
          ['负责人年度实际净收益', formatMoney(summary.managerActualNetProfit)],
          ['外部资金差额留存', formatMoney(summary.retainedProfit)],
          ['尾差调整合计', formatMoney(summary.roundingAdjustmentAmount)],
          ['已支付总额', formatMoney(totalPaid.toString())],
          ['待支付总额', formatMoney(totalUnpaid.toString())],
        ],
      },
      {
        name: '合伙人汇总',
        title: `${year} 年度合伙人汇总`,
        tables: [
          {
            headers: ['合伙人', '角色', '年度应分红', '已支付金额', '待支付金额', '调整金额', '支付状态', '备注'],
            rows: summary.rows.map((row) => [
              row.memberName,
              roleLabel(row.memberRole),
              formatMoney(row.totalDividend),
              formatMoney(row.paidAmount),
              formatMoney(row.unpaidAmount),
              formatMoney(row.adjustmentAmount),
              paymentStatusText(row.totalDividend, row.paidAmount, row.unpaidAmount),
              '',
            ]),
          },
        ],
      },
      {
        name: '月份状态',
        title: `${year} 年度月份状态`,
        tables: [
          {
            headers: ['月份', '结算状态', '是否纳入年度汇总', '理论总收益', '对外应付收益', '负责人实际净收益', '备注'],
            rows: Array.from({ length: 12 }, (_, index) => {
              const month = `${year}-${String(index + 1).padStart(2, '0')}`
              const settlement = data.monthlySettlements.find((item) => item.month === month)
              const normalized = settlement ? normalizeMonthlySettlement(settlement) : undefined
              return [
                formatMonth(month),
                statusLabel(settlement),
                settlement && isFinalizedSettlement(settlement) ? '是' : '否',
                normalized ? formatMoney(normalized.totalProfit) : '-',
                normalized ? formatMoney(normalized.externalPayableProfit) : '-',
                normalized?.managerActualNetProfit ? formatMoney(normalized.managerActualNetProfit) : '-',
                settlement?.note ?? '',
              ]
            }),
          },
        ],
      },
      {
        name: '分红支付',
        title: `${year} 年度分红支付`,
        tables: [
          {
            headers: ['合伙人', '分红年度', '支付金额', '支付日期', '支付方式', '流水号', '支付状态', '备注'],
            rows: data.dividendPayments
              .filter((payment) => payment.year === year)
              .map(normalizeDividendPayment)
              .map((payment) => [
                memberName(data, payment.memberId),
                `${payment.year} 年`,
                formatMoney(payment.paidAmount),
                formatDate(payment.paymentDate),
                paymentMethodLabel(payment.paymentMethod),
                payment.transactionRef ?? '-',
                dividendPaymentStatusLabels[payment.status],
                payment.note,
              ]),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildMemberAnnualDetailXlsxReport(data: AppData, memberId: string, year: number): ExcelReportDefinition {
  const detail = calculateMemberAnnualDetail(data, memberId, year)
  const payments = data.dividendPayments
    .filter((payment) => payment.year === year && payment.memberId === memberId)
    .map(normalizeDividendPayment)
  const allocations = data.monthlyAllocations.filter(
    (allocation) => allocation.memberId === memberId && isMonthInAnnualPeriod(allocation.month, year),
  )

  return {
    fileName: memberAnnualDetailXlsxFileName(detail.member.name, year),
    title: `合伙人年度明细-${detail.member.name}-${year}`,
    sheets: [
      {
        name: '个人年度摘要',
        title: `${detail.member.name} ${year} 年度摘要`,
        summaryRows: [
          ['合伙人姓名', detail.member.name],
          ['角色', roleLabel(detail.member.role)],
          ['分红年度', `${year} 年`],
          ['统计周期', annualPeriodText(year)],
          ['当前有效本金', formatMoney(detail.currentCapital)],
          ['年度应分红', formatMoney(detail.totalDividend)],
          ['已支付金额', formatMoney(detail.paidAmount)],
          ['待支付金额', formatMoney(detail.unpaidAmount)],
          ['调整金额', formatMoney(detail.adjustmentAmount)],
          ['支付状态', paymentStatusText(detail.totalDividend, detail.paidAmount, detail.unpaidAmount)],
        ],
      },
      {
        name: '资金批次',
        title: `${detail.member.name} 资金批次`,
        tables: [
          {
            headers: ['合伙人', '金额', '起息日期', '状态', '备注'],
            rows: detail.capitalLots.map((lot) => [
              detail.member.name,
              formatMoney(lot.amount),
              formatDate(lot.startDate),
              capitalLotStatusLabels[lot.status],
              lot.note ?? '',
            ]),
          },
        ],
      },
      {
        name: '月度收益明细',
        title: `${detail.member.name} 月度收益明细`,
        tables: [
          {
            headers: ['月份', '原始本金', '起息日期', '计息方式', '当月天数', '计息天数', '折算本金', '年化收益率', '折合月收益率', '当月收益', '调整金额', '月度合计', '备注'],
            rows: detail.monthlyDetails.map((row) => {
              const allocation = allocations.find((item) => item.month === row.month)
              const monthAdjustment = detail.adjustments
                .filter((record) => record.targetMonth === row.month)
                .reduce((sum, record) => sum.plus(record.amount), decimal(0))

              return [
                formatMonth(row.month),
                allocation ? formatMoney(allocation.originalCapital) : '-',
                allocation ? formatDate(allocation.startDate) : '-',
                prorationTypeLabels[row.prorationType],
                row.daysInMonth,
                row.interestDays,
                allocation ? formatMoney(allocation.equivalentCapital) : '-',
                formatRate(row.partnerAnnualRate),
                formatRate(row.partnerMonthlyRateSnapshot),
                formatMoney(row.totalDividend),
                formatMoney(monthAdjustment.toString()),
                formatMoney(decimal(row.totalDividend).plus(monthAdjustment).toString()),
                '',
              ]
            }),
          },
        ],
      },
      {
        name: '分红支付记录',
        title: `${detail.member.name} 分红支付记录`,
        tables: [
          {
            headers: ['支付日期', '支付金额', '支付方式', '支付状态', '备注'],
            rows: payments.map((payment) => [
              formatDate(payment.paymentDate),
              formatMoney(payment.paidAmount),
              paymentMethodLabel(payment.paymentMethod),
              dividendPaymentStatusLabels[payment.status],
              payment.note,
            ]),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildMemberDividendSlipXlsxReport(data: AppData, memberId: string, year: number): ExcelReportDefinition {
  const detail = calculateMemberAnnualDetail(data, memberId, year)

  return {
    fileName: memberDividendSlipXlsxFileName(detail.member.name, year),
    title: `合伙人个人分红条-${detail.member.name}-${year}`,
    sheets: [
      {
        name: '个人分红条',
        title: `${detail.member.name} ${year} 年个人分红条`,
        summaryRows: [
          ['合伙人姓名', detail.member.name],
          ['分红年度', `${year} 年`],
          ['首次参与日期', firstParticipationDate(detail.capitalLots, year)],
          ['年度应分红', formatMoney(detail.totalDividend)],
          ['已支付金额', formatMoney(detail.paidAmount)],
          ['待支付金额', formatMoney(detail.unpaidAmount)],
          ['支付状态', paymentStatusText(detail.totalDividend, detail.paidAmount, detail.unpaidAmount)],
          ['核对提示', '本文件仅列示本人分红核对信息，不包含其他合伙人明细。'],
        ],
        tables: [
          {
            title: '本人月度分红简表',
            headers: ['结算月份', '计息方式', '年化收益率', '当月应分红'],
            rows: detail.monthlyDetails.map((row) => [
              formatMonth(row.month),
              `${prorationTypeLabels[row.prorationType]}（${row.interestDays}/${row.daysInMonth}）`,
              formatRate(row.partnerAnnualRate),
              formatMoney(row.totalDividend),
            ]),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildAnnualDividendConfirmationsXlsxReport(data: AppData, year: number): ExcelReportDefinition {
  const drafts = calculateAnnualDividendConfirmationDrafts(data, year)
  const period = getAnnualPeriod(year)

  return {
    fileName: annualDividendConfirmationsXlsxFileName(year),
    title: `年度分红确认单-${year}`,
    sheets: [
      {
        name: '确认单总览',
        title: `${year} 年度分红确认单`,
        summaryRows: [
          ['分红年度', `${year} 年`],
          ['统计开始日', formatDate(period.periodStartDate)],
          ['统计截止日', formatDate(period.periodEndDate)],
          ['年度周期', '公历自然年度'],
          ['确认说明', '支付日期可以晚于分红年度，但收益归属年度以统计周期为准。'],
        ],
      },
      {
        name: '确认单明细',
        title: `${year} 年度确认单明细`,
        tables: [
          {
            headers: ['合伙人', '年化收益率', '折合月收益率', '年度应分红', '已支付金额', '待支付金额', '调整金额', '确认状态', '确认日期', '合伙人确认', '经办人', '备注'],
            rows: drafts.map((draft) => [
              draft.memberName,
              draft.partnerAnnualRateSummary
                .split(' | ')
                .filter(Boolean)
                .map((rate) => formatRate(rate))
                .join(' | '),
              draft.partnerMonthlyRateSnapshotSummary
                .split(' | ')
                .filter(Boolean)
                .map((rate) => formatRate(rate))
                .join(' | '),
              formatMoney(draft.payableAmount),
              formatMoney(draft.paidAmount),
              formatMoney(draft.unpaidAmount),
              formatMoney(draft.adjustmentAmount),
              draft.status === 'not_generated' ? '未生成' : '已生成',
              draft.confirmationDate ? formatDate(draft.confirmationDate) : '',
              '',
              '',
              draft.note ?? '',
            ]),
          },
        ],
        notes: ['合伙人确认、确认日期、经办人和备注区域可用于线下确认留档。'],
      },
      ruleSheet(),
    ],
  }
}

export function buildDividendPaymentsXlsxReport(data: AppData, year: number): ExcelReportDefinition {
  const summary = calculateAnnualSummaryResult(data, year)
  const payments = data.dividendPayments
    .filter((payment) => payment.year === year)
    .map(normalizeDividendPayment)

  return {
    fileName: dividendPaymentsXlsxFileName(year),
    title: `分红支付记录-${year}`,
    sheets: [
      {
        name: '支付汇总',
        title: `${year} 年度支付汇总`,
        tables: [
          {
            headers: ['合伙人', '分红年度', '支付口径', '应付金额', '已支付金额', '待支付金额', '支付状态', '最近支付日期'],
            rows: summary.rows.map((row) => {
              const latestPayment = payments
                .filter((payment) => payment.memberId === row.memberId)
                .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0]
              const payableAmount = annualDividendPaymentPayableAmount(row)
              const unpaidAmount = annualDividendPaymentUnpaidAmount(row)

              return [
                row.memberName,
                `${year} 年`,
                annualDividendPaymentBasisLabel(row),
                formatMoney(payableAmount),
                formatMoney(row.paidAmount),
                formatMoney(unpaidAmount),
                paymentStatusText(payableAmount, row.paidAmount, unpaidAmount),
                latestPayment ? formatDate(latestPayment.paymentDate) : '-',
              ]
            }),
          },
        ],
      },
      {
        name: '支付明细',
        title: `${year} 年度支付明细`,
        tables: [
          {
            headers: ['合伙人', '分红年度', '支付金额', '支付日期', '支付方式', '流水号', '支付状态', '备注'],
            rows: payments.map((payment) => [
              memberName(data, payment.memberId),
              `${payment.year} 年`,
              formatMoney(payment.paidAmount),
              formatDate(payment.paymentDate),
              paymentMethodLabel(payment.paymentMethod),
              payment.transactionRef ?? '-',
              dividendPaymentStatusLabels[payment.status],
              payment.note,
            ]),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildOperationLogsXlsxReport(data: AppData, year = new Date().getFullYear()): ExcelReportDefinition {
  return {
    fileName: operationLogsXlsxFileName(year),
    title: `操作日志-${year}`,
    sheets: [
      {
        name: '操作日志',
        title: `${year} 年操作日志`,
        tables: [
          {
            headers: ['操作时间', '操作类型', '操作对象', '操作说明', '备注'],
            rows: data.operationLogs
              .filter((log) => log.createdAt.startsWith(String(year)))
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((log) => [
                formatDateTime(log.createdAt),
                operationActionLabel(log.action),
                operationEntityText(log.entityType, log.entityId),
                operationActionLabel(log.action),
                log.note ?? '',
              ]),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function buildProfitCalculatorRecordsXlsxReport(data: AppData, year = new Date().getFullYear()): ExcelReportDefinition {
  const members = memberById(data)

  return {
    fileName: profitCalculatorRecordsXlsxFileName(year),
    title: `收益计算器记录-${year}`,
    sheets: [
      {
        name: '测算记录',
        title: `${year} 年收益测算记录`,
        tables: [
          {
            headers: ['创建时间', '关联合伙人', '测算模式', '投资金额', '年化收益率', '折合月收益率', '起息日期', '年度截止日', '首月计息天数', '后续整月数', '实际收益', '本息合计', '备注'],
            rows: data.profitCalculatorRecords
              .filter((record) => record.createdAt.startsWith(String(year)))
              .map((record) => [
                formatDateTime(record.createdAt),
                record.memberId ? members.get(record.memberId)?.name ?? '未知合伙人' : '不关联',
                calculatorModeLabel(record),
                formatMoney(record.investmentAmount),
                formatRate(record.annualRate),
                formatRate(record.monthlyRate),
                formatDate(record.startDate),
                record.periodEndDate ? formatDate(record.periodEndDate) : '-',
                `${record.firstMonthInterestDays}/${record.firstMonthDays}`,
                `${record.fullMonthCount} 个月`,
                formatMoney(record.totalProfit),
                formatMoney(record.principalPlusProfit),
                record.note ?? '',
              ]),
          },
        ],
      },
      ruleSheet(),
    ],
  }
}

export function exportMonthlySettlementXlsx(data: AppData, month: string): Promise<void> {
  return downloadExcelReport(buildMonthlySettlementXlsxReport(data, month))
}

export function exportMonthlySettlementsYearXlsx(data: AppData, year: number): Promise<void> {
  return downloadExcelReport(buildMonthlySettlementsYearXlsxReport(data, year))
}

export function exportAnnualSummaryXlsx(data: AppData, year: number): Promise<void> {
  return downloadExcelReport(buildAnnualSummaryXlsxReport(data, year))
}

export function exportMemberAnnualDetailXlsx(data: AppData, memberId: string, year: number): Promise<void> {
  return downloadExcelReport(buildMemberAnnualDetailXlsxReport(data, memberId, year))
}

export function exportMemberDividendSlipXlsx(data: AppData, memberId: string, year: number): Promise<void> {
  return downloadExcelReport(buildMemberDividendSlipXlsxReport(data, memberId, year))
}

export function exportAnnualDividendConfirmationsXlsx(data: AppData, year: number): Promise<void> {
  return downloadExcelReport(buildAnnualDividendConfirmationsXlsxReport(data, year))
}

export function exportDividendPaymentsXlsx(data: AppData, year: number): Promise<void> {
  return downloadExcelReport(buildDividendPaymentsXlsxReport(data, year))
}

export function exportOperationLogsXlsx(data: AppData, year?: number): Promise<void> {
  return downloadExcelReport(buildOperationLogsXlsxReport(data, year))
}

export function exportProfitCalculatorRecordsXlsx(data: AppData, year?: number): Promise<void> {
  return downloadExcelReport(buildProfitCalculatorRecordsXlsxReport(data, year))
}
