import type {
  AdjustmentRecord,
  AnnualDividendConfirmation,
  AnnualSummaryRow,
  AppData,
  CapitalLot,
  MemberAnnualMonthlyDetail,
  OperationLog,
  MonthlySettlement,
  ProfitCalculatorRecord,
} from '../domain/types'
import {
  capitalLotFromTransaction,
  calculateAnnualDividendConfirmationDrafts,
  calculateMemberAnnualDetail,
  calculateAnnualSummary,
  calculateAnnualSummaryResult,
  normalizeDividendPayment,
  normalizeCapitalTransaction,
  normalizeMonthlySettlement,
  getAnnualPeriod,
  isMonthInAnnualPeriod,
  uniqueRateSnapshotSummary,
} from '../domain/calculation'
import { normalizeProfitCalculatorRecord } from '../domain/profitCalculator'
import {
  actualReconciliationStatusLabels,
  adjustmentTypeLabels,
  annualConfirmationStatusLabels,
  csvCell,
  dividendPaymentStatusLabels,
  entityTypeLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMonth,
  formatRate,
  operationActionLabel,
  operationEntityText,
  paymentMethodLabel,
  prorationTypeLabels,
  roundingAdjustmentTargetLabels,
  settlementStatusLabels,
} from '../utils/format'
import { decimal, moneyString } from '../utils/decimal'

export const APP_NAME = '合伙人月度收益计算与年度分红汇总系统'
export const CURRENT_SCHEMA_VERSION = 8
const SUPPORTED_SCHEMA_VERSIONS = new Set([5, 6, 7, 8])

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error('导入文件格式无效。')
  }
}

export function buildJsonExport(data: AppData): string {
  const exportedAt = new Date().toISOString()
  const normalizedData: AppData = {
    ...data,
    monthlySettlements: data.monthlySettlements.map(normalizeMonthlySettlement),
    dividendPayments: data.dividendPayments.map(normalizeDividendPayment),
    profitCalculatorRecords: data.profitCalculatorRecords.map(normalizeProfitCalculatorRecord),
  }

  return JSON.stringify(
    {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      version: CURRENT_SCHEMA_VERSION,
      exportedAt,
      appName: APP_NAME,
      members: normalizedData.members,
      capitalLots: normalizedData.capitalLots,
      capitalTransactions: normalizedData.capitalTransactions,
      monthlySettlements: normalizedData.monthlySettlements,
      monthlyAllocations: normalizedData.monthlyAllocations,
      adjustmentRecords: normalizedData.adjustmentRecords,
      dividendPayments: normalizedData.dividendPayments,
      annualDividendConfirmations: normalizedData.annualDividendConfirmations,
      calculatorRecords: normalizedData.profitCalculatorRecords,
      operationLogs: normalizedData.operationLogs,
      data: normalizedData,
    },
    null,
    2,
  )
}

export function parseJsonImport(raw: string): AppData {
  const parsed = JSON.parse(raw) as unknown
  assertRecord(parsed)
  const schemaVersion = Number(parsed.schemaVersion ?? parsed.version ?? 0)

  if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw new Error('导入备份文件的数据版本不受支持，请使用本系统导出的备份文件。')
  }

  const source = 'data' in parsed ? parsed.data : parsed
  assertRecord(source)
  const capitalTransactions = asArray(source.capitalTransactions).map((transaction) =>
    normalizeCapitalTransaction(transaction as AppData['capitalTransactions'][number]),
  )
  const importedLots = asArray(source.capitalLots) as CapitalLot[]
  const capitalLots =
    importedLots.length > 0
      ? importedLots
      : capitalTransactions.flatMap((transaction) => {
          const lot = capitalLotFromTransaction(transaction)
          return lot ? [lot] : []
        })

  const data = {
    members: asArray(source.members),
    capitalLots,
    capitalTransactions,
    monthlySettlements: asArray(source.monthlySettlements).map((settlement) =>
      normalizeMonthlySettlement(settlement as MonthlySettlement),
    ),
    monthlyAllocations: asArray(source.monthlyAllocations),
    dividendPayments: asArray(source.dividendPayments).map((payment) =>
      normalizeDividendPayment(payment as AppData['dividendPayments'][number]),
    ),
    adjustmentRecords: asArray(source.adjustmentRecords) as AdjustmentRecord[],
    annualDividendConfirmations: asArray(source.annualDividendConfirmations) as AnnualDividendConfirmation[],
    operationLogs: asArray(source.operationLogs) as OperationLog[],
    profitCalculatorRecords: asArray(source.profitCalculatorRecords).map((record) =>
      normalizeProfitCalculatorRecord(record as ProfitCalculatorRecord),
    ),
  } as AppData

  if (data.profitCalculatorRecords.length === 0) {
    data.profitCalculatorRecords = asArray(source.calculatorRecords).map((record) =>
      normalizeProfitCalculatorRecord(record as ProfitCalculatorRecord),
    )
  }

  for (const collection of Object.values(data)) {
    for (const record of collection) {
      assertRecord(record)

      const requiresUpdatedAt = collection !== data.operationLogs

      if (!record.id || !record.createdAt || (requiresUpdatedAt && !record.updatedAt)) {
        throw new Error('导入备份文件中存在缺少基础记录信息的数据，请检查备份来源。')
      }
    }
  }

  const managerCount = data.members.filter((member) => member.role === 'manager').length

  if (managerCount > 1) {
    throw new Error('导入数据无效：负责人只能有一个。')
  }

  return data
}

export function buildImportSummary(raw: string): string[] {
  const data = parseJsonImport(raw)

  return [
    `合伙人：${data.members.length}`,
    `资金批次：${data.capitalLots.length}`,
    `月度结算：${data.monthlySettlements.length}`,
    `分配明细：${data.monthlyAllocations.length}`,
    `调整记录：${data.adjustmentRecords.length}`,
    `分红支付：${data.dividendPayments.length}`,
    `年度确认单：${data.annualDividendConfirmations.length}`,
    `操作日志：${data.operationLogs.length}`,
  ]
}

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

function retainedHandlingLabel(value: MonthlySettlement['retainedHandling']): string {
  const labels: Record<Exclude<MonthlySettlement['retainedHandling'], ''>, string> = {
    company_retained: '公司留存',
    risk_reserve: '风险准备金',
    pending_distribution: '待后续分配',
    other: '其他',
  }

  return value ? labels[value] : ''
}

function formatRateSnapshotSummary(value: string): string {
  return value
    ? value
        .split(' | ')
        .filter(Boolean)
        .map((rate) => formatRate(rate))
        .join(' | ')
    : ''
}

function isZeroMoney(value: string): boolean {
  return decimal(value).isZero()
}

function isParticipatingMonthlyDetail(row: MemberAnnualMonthlyDetail): boolean {
  return row.prorationType !== 'not_started' && row.interestDays > 0
}

function dateTextFromMonthDay(month: string, day: number): string {
  return formatDate(`${month}-${String(day).padStart(2, '0')}`)
}

function memberSlipStartDateText(row: MemberAnnualMonthlyDetail): string {
  const firstInterestDay =
    row.prorationType === 'first_month_prorated'
      ? row.daysInMonth - row.interestDays + 1
      : 1

  return dateTextFromMonthDay(row.month, Math.max(1, firstInterestDay))
}

function memberSlipEndDateText(row: MemberAnnualMonthlyDetail): string {
  return dateTextFromMonthDay(row.month, row.daysInMonth)
}

function memberSlipInterestText(row: MemberAnnualMonthlyDetail): string {
  if (row.prorationType === 'first_month_prorated') {
    return `${prorationTypeLabels[row.prorationType]}（${row.interestDays}/${row.daysInMonth}）`
  }

  return prorationTypeLabels[row.prorationType]
}

export function buildAnnualSummaryCsv(data: AppData, year: number): string {
  const rows = calculateAnnualSummary(data, year)
  const summary = calculateAnnualSummaryResult(data, year)
  const annualPeriod = getAnnualPeriod(year)
  const partnerAnnualRateSummary = uniqueRateSnapshotSummary(data, year, 'partnerAnnualRate')
  const partnerMonthlyRateSnapshotSummary = uniqueRateSnapshotSummary(
    data,
    year,
    'partnerMonthlyRateSnapshot',
  )
  const header = [
    '分红年度',
    '统计开始日',
    '统计截止日',
    '年度周期',
    '合伙人',
    '角色',
    '普通合伙人年化收益率',
    '折合月收益率',
    '全年普通分红',
    '全年负责人收益',
    '年度实际净收益',
    '调整金额',
    '全年应分红',
    '已支付',
    '待支付',
  ]

  return [
    csvLine(['分红年度', year]),
    csvLine(['统计开始日', formatDate(annualPeriod.periodStartDate)]),
    csvLine(['统计截止日', formatDate(annualPeriod.periodEndDate)]),
    csvLine(['年度周期', '公历自然年度']),
    csvLine(['全年外部资金差额留存', summary.retainedProfit]),
    csvLine(['年度尾差调整', summary.roundingAdjustmentAmount]),
    csvLine(['负责人年度理论收益', summary.managerTheoreticalProfit]),
    csvLine(['负责人年度实际净收益', summary.managerActualNetProfit]),
    csvLine(['年度实际差额', summary.managerNetDiff]),
    csvLine(['年度调整金额', summary.annualAdjustmentAmount]),
    csvLine(['未归属成员调整金额', summary.unassignedAdjustmentAmount]),
    csvLine(['普通合伙人年化收益率（小数）', partnerAnnualRateSummary]),
    csvLine(['普通合伙人年化收益率（百分比）', formatRateSnapshotSummary(partnerAnnualRateSummary)]),
    csvLine(['普通合伙人折合月收益率（小数）', partnerMonthlyRateSnapshotSummary]),
    csvLine(['普通合伙人折合月收益率（百分比）', formatRateSnapshotSummary(partnerMonthlyRateSnapshotSummary)]),
    csvLine(['收益率口径说明', '年化单利，月收益率 = 年化收益率 ÷ 12；外部资金差额留存仅基于非负责人折算本金计算；尾差默认归负责人。']),
    '',
    csvLine(header),
    ...rows.map((row: AnnualSummaryRow) =>
      csvLine([
        year,
        formatDate(annualPeriod.periodStartDate),
        formatDate(annualPeriod.periodEndDate),
        '公历自然年度',
        row.memberName,
        row.memberRole === 'manager' ? '负责人' : '合伙人',
        formatRateSnapshotSummary(partnerAnnualRateSummary),
        formatRateSnapshotSummary(partnerMonthlyRateSnapshotSummary),
        row.partnerProfit,
        row.managerProfit,
        row.actualNetProfit,
        row.adjustmentAmount,
        row.totalDividend,
        row.paidAmount,
        row.unpaidAmount,
      ]),
    ),
  ].join('\n')
}

export function buildMonthlySettlementCsv(data: AppData, year: number): string {
  const settlementsById = new Map<string, MonthlySettlement>(
    data.monthlySettlements
      .filter((settlement) => isMonthInAnnualPeriod(settlement.month, year))
      .map((settlement) => [settlement.id, normalizeMonthlySettlement(settlement)]),
  )
  const header = [
    '月份',
    '状态',
    '合伙人',
    '角色',
    '投资金额',
    '起息日期',
    '计息方式',
    '当月总天数',
    '计息天数',
    '折算比例',
    '折算本金',
    '普通合伙人年化收益率(小数)',
    '普通合伙人年化收益率(百分比)',
    '折合月收益率(小数)',
    '折合月收益率(百分比)',
    '适用月收益率(小数)',
    '适用月收益率(百分比)',
    '持股比例',
    '分配模式',
    '外部资金差额留存率',
    '外部资金差额留存',
    '外部资金差额留存处理方式',
    '尾差调整',
    '尾差归属',
    '尾差说明',
    '实际可分配净收入',
    '对外合伙人应付收益',
    '负责人理论收益',
    '负责人实际净收益',
    '理论总收益',
    '实际收入差额',
    '负责人实际差额',
    '实际收入对账状态',
    '实际收入备注',
    '普通分红',
    '负责人自有资金收益',
    '负责人专项收益',
    '理论总收益',
    '当月应付收益',
  ]
  const rows = data.monthlyAllocations.filter((allocation) =>
    settlementsById.has(allocation.settlementId),
  )

  return [
    csvLine(header),
    ...rows.map((row) => {
      const settlement = settlementsById.get(row.settlementId)

      return csvLine([
        formatMonth(row.month),
        settlement ? settlementStatusLabels[settlement.status] : '',
        row.memberName,
        row.memberRole === 'manager' ? '负责人' : '合伙人',
        row.originalCapital ?? row.memberCapital,
        formatDate(row.startDate ?? `${row.month}-01`),
        prorationTypeLabels[row.prorationType ?? 'full_month'],
        row.daysInMonth ?? '',
        row.interestDays ?? '',
        row.prorationFactor ?? '',
        row.equivalentCapital ?? row.memberCapital,
        settlement?.partnerAnnualRate ?? '',
        settlement?.partnerAnnualRate ? formatRate(settlement.partnerAnnualRate) : '',
        settlement?.partnerMonthlyRateSnapshot ?? '',
        settlement?.partnerMonthlyRateSnapshot ? formatRate(settlement.partnerMonthlyRateSnapshot) : '',
        row.applicableRate ?? '',
        row.applicableRate ? formatRate(row.applicableRate) : '',
        row.capitalRatio,
        settlement?.allocationMode === 'manual_all_rates'
          ? '三收益率手动录入'
          : '自动计算普通分红率',
        settlement?.retainedRate ?? '0',
        settlement?.retainedProfit ?? '0.00',
        retainedHandlingLabel(settlement?.retainedHandling ?? ''),
        settlement?.roundingAdjustmentAmount ?? '0.00',
        settlement ? roundingAdjustmentTargetLabels[settlement.roundingAdjustmentTarget] : '',
        settlement?.roundingAdjustmentNote ?? '',
        settlement?.actualDistributableNetIncome ?? settlement?.actualDistributableIncome ?? '',
        settlement?.externalPayableProfit ?? '0.00',
        settlement?.managerTheoreticalProfit ?? '0.00',
        settlement?.managerActualNetProfit ?? '',
        settlement?.theoreticalTotalProfit ?? '0.00',
        settlement?.actualIncomeDiff ?? '',
        settlement?.managerNetDiff ?? '',
        actualReconciliationStatusLabels[settlement?.actualReconciliationStatus ?? 'not_entered'],
        settlement?.actualIncomeNote ?? '',
        row.partnerProfit,
        row.managerOwnCapitalProfit ?? row.managerProfit,
        row.managerSpecialProfit ?? '0.00',
        row.totalProfit ?? row.monthlyProfit,
        row.monthlyProfit,
      ])
    }),
  ].join('\n')
}

export function buildMemberAnnualDetailCsv(data: AppData, memberId: string, year: number): string {
  const detail = calculateMemberAnnualDetail(data, memberId, year)
  const annualPeriod = getAnnualPeriod(year)

  return [
    csvLine(['合伙人年度明细', detail.member.name, year]),
    csvLine(['分红年度', year]),
    csvLine(['统计开始日', formatDate(annualPeriod.periodStartDate)]),
    csvLine(['统计截止日', formatDate(annualPeriod.periodEndDate)]),
    csvLine(['年度周期', '公历自然年度']),
    csvLine(['当前有效本金', detail.currentCapital]),
    csvLine(['年度普通收益', detail.partnerProfit]),
    csvLine(['年度负责人收益', detail.managerProfit]),
    csvLine(['调整金额', detail.adjustmentAmount]),
    csvLine(['年度应分红', detail.totalDividend]),
    csvLine(['已支付', detail.paidAmount]),
    csvLine(['待支付', detail.unpaidAmount]),
    '',
    csvLine(['月度明细']),
    csvLine([
      '月份',
      '普通合伙人年化收益率',
      '折合月收益率',
      '计息方式',
      '当月总天数',
      '计息天数',
      '普通收益',
      '负责人收益',
      '当月应分红',
    ]),
    ...detail.monthlyDetails.map((row) =>
      csvLine([
        formatMonth(row.month),
        formatRate(row.partnerAnnualRate),
        formatRate(row.partnerMonthlyRateSnapshot),
        prorationTypeLabels[row.prorationType],
        row.daysInMonth,
        row.interestDays,
        row.partnerProfit,
        row.managerProfit,
        row.totalDividend,
      ]),
    ),
    '',
    csvLine(['调整记录']),
    csvLine(['目标月份', '调整月份', '类型', '金额', '原因']),
    ...detail.adjustments.map((record) =>
      csvLine([
        formatMonth(record.targetMonth),
        formatMonth(record.adjustmentMonth),
        adjustmentTypeLabels[record.type],
        record.amount,
        record.reason,
      ]),
    ),
  ].join('\n')
}

export function buildMemberDividendSlipCsv(data: AppData, memberId: string, year: number): string {
  const detail = calculateMemberAnnualDetail(data, memberId, year)
  const monthlyRows = detail.monthlyDetails
    .filter(isParticipatingMonthlyDetail)
    .sort((a, b) => a.month.localeCompare(b.month))
  const firstMonthlyRow = monthlyRows[0]
  const lastMonthlyRow = monthlyRows.at(-1)
  const settledProfit = moneyString(decimal(detail.partnerProfit).plus(detail.managerProfit))
  const hasAdjustments = detail.adjustments.length > 0 || !isZeroMoney(detail.adjustmentAmount)
  const paymentStatus = isZeroMoney(detail.unpaidAmount) ? '已结清' : '待支付'

  return [
    csvLine(['合伙人个人分红条']),
    csvLine(['合伙人姓名', detail.member.name]),
    csvLine(['分红年度', year]),
    csvLine(['本人核算开始日', firstMonthlyRow ? memberSlipStartDateText(firstMonthlyRow) : '暂无已锁定参与月份']),
    csvLine(['本人核算截止日', lastMonthlyRow ? memberSlipEndDateText(lastMonthlyRow) : '暂无已锁定参与月份']),
    csvLine(['参与月份数', `${monthlyRows.length}个月`]),
    csvLine(['核算说明', '本文件仅列示该合伙人本人在本年度已锁定或已调整月份中的分红核对信息；提前退出不按全年展示。']),
    '',
    csvLine(['个人分红汇总']),
    csvLine(['项目', '金额或状态']),
    csvLine(['已结算收益', settledProfit]),
    ...(hasAdjustments ? [csvLine(['调整金额', detail.adjustmentAmount])] : []),
    csvLine(['年度应分红', detail.totalDividend]),
    csvLine(['已支付金额', detail.paidAmount]),
    csvLine(['待支付金额', detail.unpaidAmount]),
    csvLine(['支付状态', paymentStatus]),
    '',
    csvLine(['本人月度分红简表']),
    csvLine(['结算月份', '计息说明', '年化收益率', '当月应分红']),
    ...monthlyRows.map((row) =>
      csvLine([
        formatMonth(row.month),
        memberSlipInterestText(row),
        formatRate(row.partnerAnnualRate),
        row.totalDividend,
      ]),
    ),
    ...(detail.adjustments.length > 0
      ? [
          '',
          csvLine(['本人调整说明']),
          csvLine(['调整月份', '金额', '说明']),
          ...detail.adjustments.map((record) =>
            csvLine([formatMonth(record.adjustmentMonth), record.amount, record.reason]),
          ),
        ]
      : []),
    '',
    csvLine(['核对提示', '如对金额有疑问，请先与负责人核对后再确认。']),
  ].join('\n')
}

export function buildDividendPaymentsCsv(data: AppData, year: number): string {
  const annualPeriod = getAnnualPeriod(year)
  const header = [
    '分红年度',
    '统计开始日',
    '统计截止日',
    '年度周期',
    '合伙人',
    '状态',
    '应付金额',
    '支付金额',
    '记录后未付',
    '支付日期',
    '支付方式',
    '流水号',
    '备注',
  ]
  const membersById = new Map(data.members.map((member) => [member.id, member]))
  const rows = data.dividendPayments
    .filter((payment) => payment.year === year)
    .map(normalizeDividendPayment)

  return [
    csvLine(['分红年度', year]),
    csvLine(['统计开始日', formatDate(annualPeriod.periodStartDate)]),
    csvLine(['统计截止日', formatDate(annualPeriod.periodEndDate)]),
    csvLine(['年度周期', '公历自然年度']),
    csvLine(['归属说明', '支付日期可以晚于分红年度，但收益归属年度以统计周期为准。']),
    '',
    csvLine(header),
    ...rows.map((payment) =>
      csvLine([
        payment.year,
        formatDate(annualPeriod.periodStartDate),
        formatDate(annualPeriod.periodEndDate),
        '公历自然年度',
        membersById.get(payment.memberId)?.name ?? '未知成员',
        dividendPaymentStatusLabels[payment.status],
        payment.payableAmount,
        payment.paidAmount,
        payment.unpaidAmount,
        formatDate(payment.paymentDate),
        paymentMethodLabel(payment.paymentMethod),
        payment.transactionRef ?? '',
        payment.note,
      ]),
    ),
  ].join('\n')
}

export function buildAnnualDividendConfirmationsCsv(data: AppData, year: number): string {
  const rows = calculateAnnualDividendConfirmationDrafts(data, year)
  const annualPeriod = getAnnualPeriod(year)
  const header = [
    '分红年度',
    '统计开始日',
    '统计截止日',
    '年度周期',
    '合伙人',
    '普通合伙人年化收益率',
    '折合月收益率',
    '年度应分红',
    '已支付',
    '待支付',
    '调整金额',
    '确认状态',
    '确认日期',
    '备注',
  ]

  return [
    csvLine(['分红年度', year]),
    csvLine(['统计开始日', formatDate(annualPeriod.periodStartDate)]),
    csvLine(['统计截止日', formatDate(annualPeriod.periodEndDate)]),
    csvLine(['年度周期', '公历自然年度']),
    csvLine(['归属说明', '支付日期可以晚于分红年度，但收益归属年度以统计周期为准。']),
    '',
    csvLine(header),
    ...rows.map((row) =>
      csvLine([
        row.year,
        formatDate(annualPeriod.periodStartDate),
        formatDate(annualPeriod.periodEndDate),
        '公历自然年度',
        row.memberName,
        formatRateSnapshotSummary(row.partnerAnnualRateSummary),
        formatRateSnapshotSummary(row.partnerMonthlyRateSnapshotSummary),
        row.payableAmount,
        row.paidAmount,
        row.unpaidAmount,
        row.adjustmentAmount,
        annualConfirmationStatusLabels[row.status],
        row.confirmationDate ? formatDate(row.confirmationDate) : '',
        row.note ?? '',
      ]),
    ),
  ].join('\n')
}

function profitCalculatorModeLabel(record: ProfitCalculatorRecord): string {
  return record.calculatorMode === 'calendar_year' ? '自然年度清算' : '实际投入月数'
}

export function buildProfitCalculatorRecordsCsv(data: AppData, year = new Date().getFullYear()): string {
  const membersById = new Map(data.members.map((member) => [member.id, member.name]))
  const header = [
    '创建时间',
    '关联合伙人',
    '测算模式',
    '投资金额',
    '年化收益率',
    '折合月收益率',
    '实际投入月数',
    '起息日期',
    '清算年度',
    '年度截止日',
    '实际收益',
    '本息合计',
    '备注',
  ]

  return [
    csvLine(['导出年度', year]),
    '',
    csvLine(header),
    ...data.profitCalculatorRecords
      .filter((record) => record.createdAt.startsWith(String(year)))
      .map((record) =>
        csvLine([
          formatDateTime(record.createdAt),
          record.memberId ? membersById.get(record.memberId) ?? '未知合伙人' : '不关联',
          profitCalculatorModeLabel(record),
          formatMoney(record.investmentAmount),
          formatRate(record.annualRate),
          formatRate(record.monthlyRate),
          record.settlementCycleMonths ? `${record.settlementCycleMonths}个月` : '',
          formatDate(record.startDate),
          record.settlementYear ?? record.periodEndDate?.slice(0, 4) ?? '',
          record.periodEndDate ? formatDate(record.periodEndDate) : '',
          formatMoney(record.totalProfit),
          formatMoney(record.principalPlusProfit),
          record.note ?? '',
        ]),
      ),
  ].join('\n')
}

export function buildOperationLogsCsv(data: AppData): string {
  const header = ['操作时间', '操作内容', '业务对象', '关联记录', '备注']

  return [
    csvLine(header),
    ...data.operationLogs.map((log) =>
      csvLine([
        formatDateTime(log.createdAt),
        operationActionLabel(log.action),
        entityTypeLabel(log.entityType),
        operationEntityText(log.entityType, log.entityId),
        log.note ?? '',
      ]),
    ),
  ].join('\n')
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
