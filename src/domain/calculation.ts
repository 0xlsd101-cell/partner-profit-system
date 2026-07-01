import type {
  AnnualDividendConfirmationDraft,
  AnnualSummaryRow,
  AnnualSummaryResult,
  AppData,
  AdjustmentRecord,
  BaseRecord,
  CapitalLot,
  CapitalSnapshotRow,
  CapitalTransaction,
  DashboardMetrics,
  DividendPayment,
  Member,
  MemberAnnualDetail,
  MemberAnnualMonthlyDetail,
  MonthlyAllocation,
  MonthlyCalculationInput,
  MonthlyCalculationResult,
  MonthlySettlement,
  ProrationType,
  RecordId,
  SettlementStatus,
} from './types'
import { Decimal, decimal, moneyString, ratioString, rateString } from '../utils/decimal'

function parseYearMonth(month: string): { year: number; monthIndex: number } {
  const [year, monthText] = month.split('-')

  return {
    year: Number(year),
    monthIndex: Number(monthText) - 1,
  }
}

export function daysInNaturalMonth(month: string): number {
  const { year, monthIndex } = parseYearMonth(month)

  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

export interface AnnualPeriod {
  year: number
  periodStartDate: string
  periodEndDate: string
}

export function getAnnualPeriod(year: number): AnnualPeriod {
  return {
    year,
    periodStartDate: `${year}-01-01`,
    periodEndDate: `${year}-12-31`,
  }
}

export function isMonthInAnnualPeriod(month: string, year: number): boolean {
  return month >= `${year}-01` && month <= `${year}-12`
}

function monthStartDate(month: string): string {
  return `${month}-01`
}

function monthEndDate(month: string): string {
  return `${month}-${String(daysInNaturalMonth(month)).padStart(2, '0')}`
}

function dateDay(date: string): number {
  return Number(date.slice(8, 10))
}

function transactionDefaultStartDate(transaction: Pick<CapitalTransaction, 'effectiveMonth'>): string {
  return `${transaction.effectiveMonth}-01`
}

export function normalizeCapitalTransaction(transaction: CapitalTransaction): CapitalTransaction {
  return {
    ...transaction,
    startDate: transaction.startDate || transactionDefaultStartDate(transaction),
  }
}

export function normalizeDividendPayment(payment: DividendPayment): DividendPayment {
  const paidAmount = payment.paidAmount ?? payment.amount ?? '0'
  const paymentDate = payment.paymentDate ?? payment.paidAt ?? payment.createdAt.slice(0, 10)
  const payableAmount = payment.payableAmount ?? paidAmount

  return {
    ...payment,
    payableAmount: moneyString(payableAmount),
    paidAmount: moneyString(paidAmount),
    unpaidAmount: moneyString(payment.unpaidAmount ?? decimal(payableAmount).minus(paidAmount)),
    paymentDate,
    paymentMethod: payment.paymentMethod ?? '未记录',
    note: payment.note ?? '',
    status: payment.status ?? 'active',
    paidAt: payment.paidAt ?? paymentDate,
    amount: payment.amount ?? paidAmount,
  }
}

export function isActiveDividendPayment(payment: DividendPayment): boolean {
  return normalizeDividendPayment(payment).status !== 'void'
}

export function annualDividendConfirmationRecordId(year: number, memberId: string): string {
  return `dividend_confirmation_${year}_${memberId}`
}

export function calculateMonthlyRateFromAnnualRate(annualRate: Decimal.Value): string {
  return rateString(decimal(annualRate).div(12))
}

export function calculatePartnerProfitByAnnualRate(input: {
  originalCapital: Decimal.Value
  partnerAnnualRate: Decimal.Value
  prorationFactor?: Decimal.Value
  equivalentCapital?: Decimal.Value
  interestDays?: number
  daysInMonth?: number
}): string {
  let equivalentCapital = input.equivalentCapital !== undefined
    ? decimal(input.equivalentCapital)
    : decimal(input.originalCapital)

  if (input.equivalentCapital === undefined) {
    if (input.prorationFactor !== undefined) {
      equivalentCapital = equivalentCapital.mul(input.prorationFactor)
    } else if (input.interestDays !== undefined && input.daysInMonth !== undefined) {
      equivalentCapital = equivalentCapital.mul(input.interestDays).div(input.daysInMonth)
    }
  }

  return moneyString(equivalentCapital.mul(calculateMonthlyRateFromAnnualRate(input.partnerAnnualRate)))
}

function transactionEffect(transaction: CapitalTransaction): Decimal {
  const amount = decimal(transaction.amount)

  if (transaction.type === 'withdrawal') {
    return amount.negated()
  }

  return amount
}

export function calculateCapitalSnapshot(
  members: Member[],
  transactions: CapitalTransaction[],
  month: string,
): CapitalSnapshotRow[] {
  const capitalByMember = new Map<RecordId, Decimal>()

  for (const member of members) {
    capitalByMember.set(member.id, new Decimal(0))
  }

  for (const transaction of transactions) {
    if (transaction.effectiveMonth > month || !capitalByMember.has(transaction.memberId)) {
      continue
    }

    const current = capitalByMember.get(transaction.memberId) ?? new Decimal(0)
    capitalByMember.set(transaction.memberId, current.plus(transactionEffect(transaction)))
  }

  return members.map((member) => ({
    member,
    capital: moneyString(capitalByMember.get(member.id) ?? 0),
  }))
}

export function isFinalizedSettlementStatus(status: SettlementStatus): boolean {
  return status === 'locked' || status === 'adjusted'
}

export function canEditMonthlySettlement(settlement?: Pick<MonthlySettlement, 'status'>): boolean {
  return !settlement || settlement.status === 'draft'
}

interface WorkingCapitalLot extends CapitalLot {
  remainingAmount: Decimal
}

function reduceMemberLots(lots: WorkingCapitalLot[], memberId: RecordId, amount: Decimal): void {
  let remainingReduction = amount
  const memberLots = lots
    .filter((lot) => lot.memberId === memberId && lot.remainingAmount.gt(0))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt))

  for (const lot of memberLots) {
    if (remainingReduction.lte(0)) {
      return
    }

    const reduction = Decimal.min(lot.remainingAmount, remainingReduction)
    lot.remainingAmount = lot.remainingAmount.minus(reduction)
    remainingReduction = remainingReduction.minus(reduction)
    lot.amount = moneyString(lot.remainingAmount)
    lot.status = lot.remainingAmount.gt(0) ? 'active' : 'withdrawn'
  }
}

export function buildCapitalLots(
  transactions: CapitalTransaction[],
  settlementMonth: string,
  capitalLots: CapitalLot[] = [],
): CapitalLot[] {
  const monthEnd = monthEndDate(settlementMonth)
  const lots: WorkingCapitalLot[] = []
  const normalizedTransactions = transactions.map(normalizeCapitalTransaction)
  const sourceLots =
    capitalLots.length > 0
      ? capitalLots
      : normalizedTransactions
          .filter((transaction) => {
            const amount = decimal(transaction.amount)
            return transaction.type === 'deposit' || (transaction.type === 'adjustment' && amount.gt(0))
          })
          .map((transaction) => ({
            id: `capital_lot_${transaction.id}`,
            memberId: transaction.memberId,
            amount: moneyString(transaction.amount),
            startDate: transaction.startDate,
            status: 'active' as const,
            note: transaction.note,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt,
          }))

  for (const lot of sourceLots
    .filter((lot) => lot.status !== 'withdrawn' && lot.startDate <= monthEnd)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt))) {
    const amount = decimal(lot.amount)

    if (amount.lte(0)) {
      continue
    }

    lots.push({
      ...lot,
      amount: moneyString(amount),
      status: lot.status ?? 'active',
      remainingAmount: amount,
    })
  }

  const sortedReductions = normalizedTransactions.sort(
      (a, b) =>
        a.effectiveMonth.localeCompare(b.effectiveMonth) ||
        a.transactionDate.localeCompare(b.transactionDate) ||
        a.createdAt.localeCompare(b.createdAt),
    )

  for (const transaction of sortedReductions) {
    const amount = decimal(transaction.amount)

    if (transaction.type === 'deposit' || (transaction.type === 'adjustment' && amount.gt(0))) {
      continue
    }

    if (transaction.effectiveMonth > settlementMonth) {
      continue
    }

    const reduction = transaction.type === 'withdrawal' ? amount.abs() : amount.abs()
    reduceMemberLots(lots, transaction.memberId, reduction)
  }

  return lots
    .filter((lot) => lot.remainingAmount.gt(0))
    .map(({ remainingAmount: _remainingAmount, ...lot }) => ({
      ...lot,
      amount: moneyString(lot.amount),
      status: lot.status ?? 'active',
    }))
}

export function capitalLotFromTransaction(transaction: CapitalTransaction): CapitalLot | undefined {
  const normalized = normalizeCapitalTransaction(transaction)
  const amount = decimal(normalized.amount)

  if (normalized.type !== 'deposit' && !(normalized.type === 'adjustment' && amount.gt(0))) {
    return undefined
  }

  return {
    id: `capital_lot_${normalized.id}`,
    memberId: normalized.memberId,
    amount: moneyString(amount),
    startDate: normalized.startDate,
    status: 'active',
    note: normalized.note,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  }
}

interface LotProrationResult {
  prorationType: ProrationType
  daysInMonth: number
  interestDays: number
  prorationFactor: Decimal
  equivalentCapital: Decimal
}

function calculateLotProration(lot: CapitalLot, settlementMonth: string): LotProrationResult {
  const daysInMonth = daysInNaturalMonth(settlementMonth)
  const monthStart = monthStartDate(settlementMonth)
  const monthEnd = monthEndDate(settlementMonth)
  const amount = decimal(lot.amount)

  if (lot.startDate > monthEnd) {
    return {
      prorationType: 'not_started',
      daysInMonth,
      interestDays: 0,
      prorationFactor: new Decimal(0),
      equivalentCapital: new Decimal(0),
    }
  }

  if (lot.startDate <= monthStart) {
    return {
      prorationType: 'full_month',
      daysInMonth,
      interestDays: daysInMonth,
      prorationFactor: new Decimal(1),
      equivalentCapital: amount,
    }
  }

  const interestDays = daysInMonth - dateDay(lot.startDate) + 1
  const prorationFactor = new Decimal(interestDays).div(daysInMonth)

  return {
    prorationType: 'first_month_prorated',
    daysInMonth,
    interestDays,
    prorationFactor,
    equivalentCapital: amount.mul(prorationFactor),
  }
}

export function calculateMonthlySettlement(
  input: MonthlyCalculationInput,
): MonthlyCalculationResult {
  const allocationMode = input.allocationMode ?? 'auto_partner_rate'
  const totalRate = decimal(input.totalRate)
  const hasPartnerAnnualRate = input.partnerAnnualRate !== undefined && input.partnerAnnualRate !== ''
  const legacyPartnerMonthlyRate =
    allocationMode === 'auto_partner_rate'
      ? totalRate.minus(decimal(input.managerRate))
      : decimal(input.partnerRate ?? 0)
  const partnerAnnualRate = hasPartnerAnnualRate
    ? decimal(input.partnerAnnualRate ?? 0)
    : legacyPartnerMonthlyRate.mul(12)
  const partnerMonthlyRateSnapshot = decimal(calculateMonthlyRateFromAnnualRate(partnerAnnualRate))
  const managerRate =
    allocationMode === 'auto_partner_rate' && hasPartnerAnnualRate
      ? totalRate.minus(partnerMonthlyRateSnapshot)
      : decimal(input.managerRate)
  const partnerRate = partnerMonthlyRateSnapshot
  const retainedRate =
    allocationMode === 'auto_partner_rate'
      ? new Decimal(0)
      : totalRate.minus(managerRate).minus(partnerRate)
  const snapshot = calculateCapitalSnapshot(input.members, input.capitalTransactions, input.month)
  const membersById = new Map(input.members.map((member) => [member.id, member]))
  const capitalLots = buildCapitalLots(input.capitalTransactions, input.month, input.capitalLots)
  const lotRows = capitalLots
    .map((lot) => ({
      lot,
      member: membersById.get(lot.memberId),
      proration: calculateLotProration(lot, input.month),
    }))
    .filter((row) => row.member && row.proration.equivalentCapital.gt(0))
  const totalCapital = lotRows.reduce(
    (sum, row) => sum.plus(row.proration.equivalentCapital),
    new Decimal(0),
  )
  const externalEquivalentCapitalTotal = lotRows
    .filter((row) => row.member?.role !== 'manager')
    .reduce((sum, row) => sum.plus(row.proration.equivalentCapital), new Decimal(0))

  const totalProfit = totalCapital.mul(totalRate)
  const managerProfit = externalEquivalentCapitalTotal.mul(managerRate)
  const partnerProfitPool = externalEquivalentCapitalTotal.mul(partnerRate)
  const retainedProfit = externalEquivalentCapitalTotal.mul(retainedRate)

  const allocations: Omit<MonthlyAllocation, keyof BaseRecord>[] = lotRows.map((row) => {
    const member = row.member as Member
    const capital = decimal(row.lot.amount)
    const equivalentCapital = row.proration.equivalentCapital
    const capitalRatio = totalCapital.gt(0) ? equivalentCapital.div(totalCapital) : new Decimal(0)
    const isManager = member.role === 'manager'
    const applicableRate = isManager ? totalRate : partnerRate
    const partnerProfit = isManager ? new Decimal(0) : equivalentCapital.mul(partnerRate)
    const managerOwnCapitalProfit = isManager ? equivalentCapital.mul(totalRate) : new Decimal(0)
    const managerSpecialProfit = isManager ? new Decimal(0) : equivalentCapital.mul(managerRate)
    const totalLotProfit = partnerProfit.plus(managerOwnCapitalProfit).plus(managerSpecialProfit)
    const payableProfit = isManager ? managerOwnCapitalProfit : partnerProfit

    return {
      settlementId: input.settlementId ?? '',
      month: input.month,
      memberId: member.id,
      memberName: member.name,
      memberRole: member.role,
      capitalLotId: row.lot.id,
      originalCapital: moneyString(capital),
      startDate: row.lot.startDate,
      prorationType: row.proration.prorationType,
      daysInMonth: row.proration.daysInMonth,
      interestDays: row.proration.interestDays,
      prorationFactor: ratioString(row.proration.prorationFactor),
      equivalentCapital: moneyString(equivalentCapital),
      applicableRate: rateString(applicableRate),
      memberCapital: moneyString(capital),
      capitalRatio: ratioString(capitalRatio),
      partnerProfit: moneyString(partnerProfit),
      managerOwnCapitalProfit: moneyString(managerOwnCapitalProfit),
      managerSpecialProfit: moneyString(managerSpecialProfit),
      totalProfit: moneyString(totalLotProfit),
      managerProfit: moneyString(managerOwnCapitalProfit),
      monthlyProfit: moneyString(payableProfit),
    }
  })
  const roundedTheoreticalTotalProfit = decimal(moneyString(totalProfit))
  const roundedExternalPayableProfit = allocations
    .filter((allocation) => allocation.memberRole !== 'manager')
    .reduce((sum, allocation) => sum.plus(allocation.partnerProfit), new Decimal(0))
  const roundedManagerTheoreticalProfitBeforeTail = allocations.reduce(
    (sum, allocation) =>
      sum
        .plus(allocation.managerOwnCapitalProfit ?? 0)
        .plus(allocation.managerSpecialProfit ?? 0),
    new Decimal(0),
  )
  const roundedRetainedProfit = decimal(moneyString(retainedProfit))
  const roundingAdjustmentAmount = roundedTheoreticalTotalProfit
    .minus(roundedExternalPayableProfit)
    .minus(roundedManagerTheoreticalProfitBeforeTail)
    .minus(roundedRetainedProfit)
  const roundingAdjustmentTarget = 'manager' as const
  const actualReconciliation = calculateActualIncomeReconciliation({
    allocations,
    actualDistributableNetIncome:
      input.actualDistributableNetIncome ?? input.actualDistributableIncome,
    theoreticalTotalProfit: totalProfit,
    roundingAdjustmentAmount,
    roundingAdjustmentTarget,
    actualIncomeNote: input.actualIncomeNote,
    actualReconciliationStatus: input.actualReconciliationStatus,
  })

  return {
    settlement: {
      month: input.month,
      allocationMode,
      totalRate: rateString(totalRate),
      managerRate: rateString(managerRate),
      partnerRate: rateString(partnerRate),
      partnerAnnualRate: rateString(partnerAnnualRate),
      partnerMonthlyRateSnapshot: rateString(partnerMonthlyRateSnapshot),
      rateBasis: 'annual_simple',
      rateConversionMethod: 'divide_by_12',
      retainedRate: rateString(retainedRate),
      totalCapital: moneyString(totalCapital),
      totalProfit: moneyString(totalProfit),
      managerProfit: moneyString(managerProfit),
      partnerProfitPool: moneyString(partnerProfitPool),
      retainedProfit: moneyString(retainedProfit),
      retainedHandling: input.retainedHandling ?? '',
      roundingAdjustmentAmount: moneyString(roundingAdjustmentAmount),
      roundingAdjustmentTarget,
      roundingAdjustmentNote: '尾差归属：负责人',
      ...actualReconciliation,
    },
    allocations,
    capitalSnapshot: snapshot,
  }
}

export function calculateActualIncomeReconciliation(input: {
  allocations: Array<
    Pick<MonthlyAllocation, 'memberRole' | 'monthlyProfit' | 'partnerProfit'> &
      Partial<Pick<MonthlyAllocation, 'managerOwnCapitalProfit' | 'managerSpecialProfit'>>
  >
  actualDistributableNetIncome?: string
  /** @deprecated Use actualDistributableNetIncome. */
  actualDistributableIncome?: string
  theoreticalTotalProfit: Decimal.Value
  roundingAdjustmentAmount?: Decimal.Value
  roundingAdjustmentTarget?: MonthlySettlement['roundingAdjustmentTarget']
  actualIncomeNote?: string
  actualReconciliationStatus?: MonthlySettlement['actualReconciliationStatus']
}): Pick<
  MonthlySettlement,
  | 'actualDistributableIncome'
  | 'actualDistributableNetIncome'
  | 'externalPayableProfit'
  | 'managerTheoreticalProfit'
  | 'managerActualNetProfit'
  | 'theoreticalTotalProfit'
  | 'actualIncomeDiff'
  | 'managerNetDiff'
  | 'actualReconciliationStatus'
  | 'actualIncomeNote'
> {
  const externalPayableProfit = input.allocations
    .filter((allocation) => allocation.memberRole !== 'manager')
    .reduce(
      (sum, allocation) =>
        sum.plus(
          allocation.managerSpecialProfit === undefined &&
            allocation.managerOwnCapitalProfit === undefined
            ? allocation.monthlyProfit
            : allocation.partnerProfit,
        ),
      new Decimal(0),
    )
  const managerTheoreticalProfit = input.allocations.reduce((sum, allocation) => {
    if (allocation.managerOwnCapitalProfit === undefined && allocation.managerSpecialProfit === undefined) {
      return allocation.memberRole === 'manager' ? sum.plus(allocation.monthlyProfit) : sum
    }

    return sum
      .plus(allocation.managerOwnCapitalProfit ?? 0)
      .plus(allocation.managerSpecialProfit ?? 0)
  }, new Decimal(0))
  const managerTheoreticalProfitWithRounding =
    input.roundingAdjustmentTarget === 'manager'
      ? managerTheoreticalProfit.plus(input.roundingAdjustmentAmount ?? 0)
      : managerTheoreticalProfit
  const theoreticalTotalProfit = decimal(input.theoreticalTotalProfit)
  const base = {
    externalPayableProfit: moneyString(externalPayableProfit),
    managerTheoreticalProfit: moneyString(managerTheoreticalProfitWithRounding),
    theoreticalTotalProfit: moneyString(theoreticalTotalProfit),
    actualIncomeNote: input.actualIncomeNote?.trim() || undefined,
  }
  const rawActualInput = input.actualDistributableNetIncome ?? input.actualDistributableIncome

  const actualInput = rawActualInput?.trim()

  if (!actualInput) {
    return {
      ...base,
      actualDistributableNetIncome: undefined,
      actualDistributableIncome: undefined,
      managerActualNetProfit: undefined,
      actualIncomeDiff: undefined,
      managerNetDiff: undefined,
      actualReconciliationStatus: 'not_entered',
    }
  }

  const actualDistributableIncome = decimal(actualInput)
  const managerActualNetProfit = actualDistributableIncome.minus(externalPayableProfit)
  const actualIncomeDiff = actualDistributableIncome.minus(theoreticalTotalProfit)
  const managerNetDiff = managerActualNetProfit.minus(managerTheoreticalProfitWithRounding)
  const status =
    input.actualReconciliationStatus && input.actualReconciliationStatus !== 'not_entered'
      ? input.actualReconciliationStatus
      : 'draft'

  return {
    ...base,
    actualDistributableNetIncome: moneyString(actualDistributableIncome),
    actualDistributableIncome: moneyString(actualDistributableIncome),
    managerActualNetProfit: moneyString(managerActualNetProfit),
    actualIncomeDiff: moneyString(actualIncomeDiff),
    managerNetDiff: moneyString(managerNetDiff),
    actualReconciliationStatus: status,
  }
}

export function isActualIncomeDiffLarge(input: {
  actualIncomeDiff?: string
  theoreticalTotalProfit: string
}): boolean {
  if (!input.actualIncomeDiff) {
    return false
  }

  const diff = decimal(input.actualIncomeDiff).abs()
  const theoretical = decimal(input.theoreticalTotalProfit).abs()
  const threshold = theoretical.mul('0.1')

  return theoretical.gt(0) && diff.gt(threshold)
}

export function hasNegativeManagerActualNetProfit(input: {
  managerActualNetProfit?: string
}): boolean {
  return input.managerActualNetProfit ? decimal(input.managerActualNetProfit).lt(0) : false
}

export function normalizeMonthlySettlement(settlement: MonthlySettlement): MonthlySettlement {
  const actualDistributableNetIncome =
    settlement.actualDistributableNetIncome ?? settlement.actualDistributableIncome
  const partnerMonthlyRateSnapshot =
    settlement.partnerMonthlyRateSnapshot ?? settlement.partnerRate ?? '0'
  const partnerAnnualRate =
    settlement.partnerAnnualRate ?? rateString(decimal(partnerMonthlyRateSnapshot).mul(12))

  return {
    ...settlement,
    status: settlement.status ?? 'draft',
    allocationMode: settlement.allocationMode ?? 'auto_partner_rate',
    partnerRate: settlement.partnerRate ?? partnerMonthlyRateSnapshot,
    partnerAnnualRate,
    partnerMonthlyRateSnapshot,
    rateBasis: settlement.rateBasis ?? 'annual_simple',
    rateConversionMethod: settlement.rateConversionMethod ?? 'divide_by_12',
    retainedRate: settlement.retainedRate ?? '0',
    retainedProfit: settlement.retainedProfit ?? '0.00',
    retainedHandling: settlement.retainedHandling ?? '',
    roundingAdjustmentAmount: settlement.roundingAdjustmentAmount ?? '0.00',
    roundingAdjustmentTarget: settlement.roundingAdjustmentTarget ?? 'manager',
    roundingAdjustmentNote: settlement.roundingAdjustmentNote,
    actualDistributableNetIncome,
    actualDistributableIncome: settlement.actualDistributableIncome ?? actualDistributableNetIncome,
    externalPayableProfit: settlement.externalPayableProfit ?? '0.00',
    managerTheoreticalProfit: settlement.managerTheoreticalProfit ?? settlement.managerProfit ?? '0.00',
    theoreticalTotalProfit: settlement.theoreticalTotalProfit ?? settlement.totalProfit ?? '0.00',
    actualReconciliationStatus: settlement.actualReconciliationStatus ?? 'not_entered',
  }
}

export function buildStoredMonthlyCalculationResult(
  settlement: MonthlySettlement,
  allocations: MonthlyAllocation[],
): MonthlyCalculationResult {
  const normalizedSettlement = normalizeMonthlySettlement(settlement)
  const storedReconciliation =
    normalizedSettlement.actualReconciliationStatus === 'not_entered'
      ? calculateActualIncomeReconciliation({
          allocations,
          theoreticalTotalProfit: normalizedSettlement.totalProfit,
          roundingAdjustmentAmount: normalizedSettlement.roundingAdjustmentAmount,
          roundingAdjustmentTarget: normalizedSettlement.roundingAdjustmentTarget,
          actualIncomeNote: normalizedSettlement.actualIncomeNote,
        })
      : {
          actualDistributableNetIncome: normalizedSettlement.actualDistributableNetIncome,
          actualDistributableIncome: normalizedSettlement.actualDistributableIncome,
          externalPayableProfit: normalizedSettlement.externalPayableProfit,
          managerTheoreticalProfit: normalizedSettlement.managerTheoreticalProfit,
          managerActualNetProfit: normalizedSettlement.managerActualNetProfit,
          theoreticalTotalProfit: normalizedSettlement.theoreticalTotalProfit,
          actualIncomeDiff: normalizedSettlement.actualIncomeDiff,
          managerNetDiff: normalizedSettlement.managerNetDiff,
          actualReconciliationStatus: normalizedSettlement.actualReconciliationStatus,
          actualIncomeNote: normalizedSettlement.actualIncomeNote,
        }

  return {
    settlement: {
      month: normalizedSettlement.month,
      allocationMode: normalizedSettlement.allocationMode,
      totalRate: normalizedSettlement.totalRate,
      managerRate: normalizedSettlement.managerRate,
      partnerRate: normalizedSettlement.partnerRate,
      partnerAnnualRate: normalizedSettlement.partnerAnnualRate,
      partnerMonthlyRateSnapshot: normalizedSettlement.partnerMonthlyRateSnapshot,
      rateBasis: normalizedSettlement.rateBasis,
      rateConversionMethod: normalizedSettlement.rateConversionMethod,
      retainedRate: normalizedSettlement.retainedRate,
      totalCapital: normalizedSettlement.totalCapital,
      totalProfit: normalizedSettlement.totalProfit,
      managerProfit: normalizedSettlement.managerProfit,
      partnerProfitPool: normalizedSettlement.partnerProfitPool,
      retainedProfit: normalizedSettlement.retainedProfit,
      retainedHandling: normalizedSettlement.retainedHandling,
      roundingAdjustmentAmount: normalizedSettlement.roundingAdjustmentAmount,
      roundingAdjustmentTarget: normalizedSettlement.roundingAdjustmentTarget,
      roundingAdjustmentNote: normalizedSettlement.roundingAdjustmentNote,
      ...storedReconciliation,
    },
    allocations: allocations.map((allocation) => ({
      settlementId: allocation.settlementId,
      month: allocation.month,
      memberId: allocation.memberId,
      memberName: allocation.memberName,
      memberRole: allocation.memberRole,
      capitalLotId: allocation.capitalLotId ?? `legacy_${allocation.memberId}`,
      originalCapital: allocation.originalCapital ?? allocation.memberCapital,
      startDate: allocation.startDate ?? monthStartDate(allocation.month),
      prorationType: allocation.prorationType ?? 'full_month',
      daysInMonth: allocation.daysInMonth ?? daysInNaturalMonth(allocation.month),
      interestDays: allocation.interestDays ?? daysInNaturalMonth(allocation.month),
      prorationFactor: allocation.prorationFactor ?? '1',
      equivalentCapital: allocation.equivalentCapital ?? allocation.memberCapital,
      applicableRate: allocation.applicableRate ?? '0',
      memberCapital: allocation.memberCapital,
      capitalRatio: allocation.capitalRatio,
      partnerProfit: allocation.partnerProfit,
      managerOwnCapitalProfit:
        allocation.managerOwnCapitalProfit ?? (allocation.memberRole === 'manager' ? allocation.monthlyProfit : '0.00'),
      managerSpecialProfit: allocation.managerSpecialProfit ?? '0.00',
      totalProfit: allocation.totalProfit ?? allocation.monthlyProfit,
      managerProfit: allocation.managerProfit,
      monthlyProfit: allocation.monthlyProfit,
    })),
    capitalSnapshot: [],
  }
}

function blankAnnualSummaryRow(member: Pick<Member, 'id' | 'name' | 'role'>): AnnualSummaryRow {
  return {
    memberId: member.id,
    memberName: member.name,
    memberRole: member.role,
    partnerProfit: '0.00',
    managerProfit: '0.00',
    actualNetProfit: '0.00',
    adjustmentAmount: '0.00',
    totalDividend: '0.00',
    paidAmount: '0.00',
    unpaidAmount: '0.00',
  }
}

export function annualDividendPaymentPayableAmount(
  row: Pick<AnnualSummaryRow, 'totalDividend'>,
): string {
  return moneyString(row.totalDividend)
}

export function annualDividendPaymentUnpaidAmount(
  row: Pick<AnnualSummaryRow, 'totalDividend' | 'paidAmount'>,
): string {
  return moneyString(decimal(annualDividendPaymentPayableAmount(row)).minus(row.paidAmount))
}

export function annualDividendPaymentBasisLabel(
  row: Pick<AnnualSummaryRow, 'memberRole' | 'adjustmentAmount'>,
): string {
  if (row.memberRole !== 'manager') {
    return '年度应分红'
  }

  return decimal(row.adjustmentAmount).isZero()
    ? '负责人年度理论收益'
    : '负责人年度理论收益 + 调整金额'
}

function annualAdjustmentAmount(adjustments: AdjustmentRecord[], year: number): Decimal {
  return adjustments
    .filter((record) => isMonthInAnnualPeriod(record.adjustmentMonth, year))
    .reduce((sum, record) => sum.plus(record.amount), new Decimal(0))
}

function annualUnassignedAdjustmentAmount(adjustments: AdjustmentRecord[], year: number): Decimal {
  return adjustments
    .filter((record) => isMonthInAnnualPeriod(record.adjustmentMonth, year) && !record.memberId)
    .reduce((sum, record) => sum.plus(record.amount), new Decimal(0))
}

export function calculateAnnualSummary(data: AppData, year: number): AnnualSummaryRow[] {
  const lockedSettlementIds = new Set(
    data.monthlySettlements
      .filter(
        (settlement) =>
          isFinalizedSettlementStatus(settlement.status) &&
          isMonthInAnnualPeriod(settlement.month, year),
      )
      .map((settlement) => settlement.id),
  )
  const summaries = new Map<RecordId, AnnualSummaryRow>()
  const managerMember = data.members.find((member) => member.role === 'manager')

  for (const member of data.members) {
    summaries.set(member.id, blankAnnualSummaryRow(member))
  }

  for (const allocation of data.monthlyAllocations) {
    if (!lockedSettlementIds.has(allocation.settlementId)) {
      continue
    }

    const hasLotFields =
      allocation.managerOwnCapitalProfit !== undefined ||
      allocation.managerSpecialProfit !== undefined ||
      allocation.totalProfit !== undefined

    const current =
      summaries.get(allocation.memberId) ??
      blankAnnualSummaryRow({
        id: allocation.memberId,
        name: allocation.memberName,
        role: allocation.memberRole,
      })

    if (!hasLotFields) {
      current.partnerProfit = moneyString(decimal(current.partnerProfit).plus(allocation.partnerProfit))
      current.managerProfit = moneyString(decimal(current.managerProfit).plus(allocation.managerProfit))
      current.totalDividend = moneyString(decimal(current.totalDividend).plus(allocation.monthlyProfit))
      summaries.set(allocation.memberId, current)
      continue
    }

    if (allocation.memberRole === 'manager') {
      const managerOwnCapitalProfit = decimal(allocation.managerOwnCapitalProfit ?? 0)
      current.partnerProfit = moneyString(decimal(current.partnerProfit).plus(managerOwnCapitalProfit))
      current.totalDividend = moneyString(decimal(current.totalDividend).plus(managerOwnCapitalProfit))
      summaries.set(allocation.memberId, current)
      continue
    }

    current.partnerProfit = moneyString(decimal(current.partnerProfit).plus(allocation.partnerProfit))
    current.totalDividend = moneyString(decimal(current.totalDividend).plus(allocation.partnerProfit))
    summaries.set(allocation.memberId, current)

    const managerSpecialProfit = decimal(allocation.managerSpecialProfit ?? 0)

    if (!managerSpecialProfit.isZero() && managerMember) {
      const managerSummary = summaries.get(managerMember.id) ?? blankAnnualSummaryRow(managerMember)

      managerSummary.managerProfit = moneyString(decimal(managerSummary.managerProfit).plus(managerSpecialProfit))
      managerSummary.totalDividend = moneyString(decimal(managerSummary.totalDividend).plus(managerSpecialProfit))
      summaries.set(managerMember.id, managerSummary)
    }
  }

  if (managerMember) {
    for (const settlement of data.monthlySettlements.filter(
      (item) => isFinalizedSettlementStatus(item.status) && isMonthInAnnualPeriod(item.month, year),
    )) {
      const normalized = normalizeMonthlySettlement(settlement)

      if (
        normalized.roundingAdjustmentTarget !== 'manager' ||
        decimal(normalized.roundingAdjustmentAmount).isZero()
      ) {
        continue
      }

      const managerSummary = summaries.get(managerMember.id) ?? blankAnnualSummaryRow(managerMember)
      managerSummary.managerProfit = moneyString(
        decimal(managerSummary.managerProfit).plus(normalized.roundingAdjustmentAmount),
      )
      managerSummary.totalDividend = moneyString(
        decimal(managerSummary.totalDividend).plus(normalized.roundingAdjustmentAmount),
      )
      summaries.set(managerMember.id, managerSummary)
    }
  }

  for (const adjustment of data.adjustmentRecords.filter(
    (record) => isMonthInAnnualPeriod(record.adjustmentMonth, year) && record.memberId,
  )) {
    const member = data.members.find((item) => item.id === adjustment.memberId)
    const current =
      summaries.get(adjustment.memberId as RecordId) ??
      blankAnnualSummaryRow({
        id: adjustment.memberId as RecordId,
        name: member?.name ?? '未知成员',
        role: member?.role ?? 'partner',
      })

    current.adjustmentAmount = moneyString(decimal(current.adjustmentAmount).plus(adjustment.amount))
    current.totalDividend = moneyString(decimal(current.totalDividend).plus(adjustment.amount))
    summaries.set(current.memberId, current)
  }

  for (const settlement of data.monthlySettlements.filter(
    (item) => isFinalizedSettlementStatus(item.status) && isMonthInAnnualPeriod(item.month, year),
  )) {
    const normalized = normalizeMonthlySettlement(settlement)

    if (!normalized.managerActualNetProfit || !managerMember) {
      continue
    }

    const managerSummary = summaries.get(managerMember.id) ?? blankAnnualSummaryRow(managerMember)
    managerSummary.actualNetProfit = moneyString(
      decimal(managerSummary.actualNetProfit).plus(normalized.managerActualNetProfit),
    )
    summaries.set(managerMember.id, managerSummary)
  }

  for (const rawPayment of data.dividendPayments.filter((item) => item.year === year)) {
    const payment = normalizeDividendPayment(rawPayment)

    if (!isActiveDividendPayment(payment)) {
      continue
    }

    const member = data.members.find((item) => item.id === payment.memberId)
    const current =
      summaries.get(payment.memberId) ??
      blankAnnualSummaryRow({
        id: payment.memberId,
        name: member?.name ?? '未知成员',
        role: member?.role ?? 'partner',
      })

    current.paidAmount = moneyString(decimal(current.paidAmount).plus(payment.paidAmount))
    summaries.set(payment.memberId, current)
  }

  return Array.from(summaries.values())
    .map((row) => ({
      ...row,
      unpaidAmount: moneyString(decimal(row.totalDividend).minus(row.paidAmount)),
    }))
    .filter(
      (row) =>
        !decimal(row.totalDividend).isZero() ||
        !decimal(row.paidAmount).isZero() ||
        data.members.some((member) => member.id === row.memberId),
    )
    .sort((a, b) => {
      const aRank = a.memberRole === 'manager' ? 0 : 1
      const bRank = b.memberRole === 'manager' ? 0 : 1
      return aRank - bRank || a.memberName.localeCompare(b.memberName, 'zh-CN')
    })
}

export function calculateAnnualRetainedProfit(data: AppData, year: number): string {
  const retainedProfit = data.monthlySettlements
    .filter(
      (settlement) =>
        isFinalizedSettlementStatus(settlement.status) &&
        isMonthInAnnualPeriod(settlement.month, year),
    )
    .reduce((sum, settlement) => sum.plus(normalizeMonthlySettlement(settlement).retainedProfit), new Decimal(0))

  return moneyString(retainedProfit)
}

export function calculateAnnualRoundingAdjustment(data: AppData, year: number): string {
  const roundingAdjustment = data.monthlySettlements
    .filter(
      (settlement) =>
        isFinalizedSettlementStatus(settlement.status) &&
        isMonthInAnnualPeriod(settlement.month, year),
    )
    .reduce(
      (sum, settlement) => sum.plus(normalizeMonthlySettlement(settlement).roundingAdjustmentAmount),
      new Decimal(0),
    )

  return moneyString(roundingAdjustment)
}

export function calculateAnnualManagerActualSummary(data: AppData, year: number): {
  managerTheoreticalProfit: string
  managerActualNetProfit: string
  managerNetDiff: string
} {
  const lockedSettlements = data.monthlySettlements.filter(
    (settlement) =>
      isFinalizedSettlementStatus(settlement.status) && isMonthInAnnualPeriod(settlement.month, year),
  )
  const allocationsBySettlementId = new Map<RecordId, MonthlyAllocation[]>()

  for (const allocation of data.monthlyAllocations) {
    const allocations = allocationsBySettlementId.get(allocation.settlementId) ?? []
    allocations.push(allocation)
    allocationsBySettlementId.set(allocation.settlementId, allocations)
  }

  let managerTheoreticalProfit = new Decimal(0)
  let managerActualNetProfit = new Decimal(0)

  for (const settlement of lockedSettlements) {
    const normalized = normalizeMonthlySettlement(settlement)
    const settlementAllocations = allocationsBySettlementId.get(settlement.id) ?? []
    const hasLotFields = settlementAllocations.some(
      (allocation) =>
        allocation.managerOwnCapitalProfit !== undefined ||
        allocation.managerSpecialProfit !== undefined ||
        allocation.totalProfit !== undefined,
    )
    const calculatedManagerTheoreticalProfit = hasLotFields
      ? settlementAllocations.reduce(
          (sum, allocation) =>
            sum
              .plus(allocation.managerOwnCapitalProfit ?? 0)
              .plus(allocation.managerSpecialProfit ?? 0),
          new Decimal(0),
        )
      : settlementAllocations
          .filter((allocation) => allocation.memberRole === 'manager')
          .reduce((sum, allocation) => sum.plus(allocation.monthlyProfit), new Decimal(0))
    const calculatedManagerTheoreticalProfitWithRounding =
      normalized.roundingAdjustmentTarget === 'manager'
        ? calculatedManagerTheoreticalProfit.plus(normalized.roundingAdjustmentAmount)
        : calculatedManagerTheoreticalProfit

    managerTheoreticalProfit = managerTheoreticalProfit.plus(
      settlementAllocations.length > 0
        ? calculatedManagerTheoreticalProfitWithRounding
        : normalized.managerTheoreticalProfit,
    )
    managerActualNetProfit = managerActualNetProfit.plus(normalized.managerActualNetProfit ?? 0)
  }

  return {
    managerTheoreticalProfit: moneyString(managerTheoreticalProfit),
    managerActualNetProfit: moneyString(managerActualNetProfit),
    managerNetDiff: moneyString(managerActualNetProfit.minus(managerTheoreticalProfit)),
  }
}

export function calculateAnnualSummaryResult(data: AppData, year: number): AnnualSummaryResult {
  const managerActualSummary = calculateAnnualManagerActualSummary(data, year)
  const adjustmentAmount = annualAdjustmentAmount(data.adjustmentRecords, year)
  const unassignedAdjustmentAmount = annualUnassignedAdjustmentAmount(data.adjustmentRecords, year)

  return {
    rows: calculateAnnualSummary(data, year),
    retainedProfit: calculateAnnualRetainedProfit(data, year),
    roundingAdjustmentAmount: calculateAnnualRoundingAdjustment(data, year),
    ...managerActualSummary,
    annualAdjustmentAmount: moneyString(adjustmentAmount),
    unassignedAdjustmentAmount: moneyString(unassignedAdjustmentAmount),
  }
}

function finalizedSettlementIdsForYear(data: AppData, year: number): Set<RecordId> {
  return new Set(
    data.monthlySettlements
      .filter(
        (settlement) =>
          isFinalizedSettlementStatus(settlement.status) &&
          isMonthInAnnualPeriod(settlement.month, year),
      )
      .map((settlement) => settlement.id),
  )
}

function blankMonthlyDetail(
  month: string,
  settlement?: MonthlySettlement,
  allocation?: MonthlyAllocation,
): MemberAnnualMonthlyDetail {
  const normalizedSettlement = settlement ? normalizeMonthlySettlement(settlement) : undefined
  const daysInMonth = allocation?.daysInMonth ?? daysInNaturalMonth(month)

  return {
    month,
    partnerAnnualRate: normalizedSettlement?.partnerAnnualRate ?? '0',
    partnerMonthlyRateSnapshot: normalizedSettlement?.partnerMonthlyRateSnapshot ?? '0',
    prorationType: allocation?.prorationType ?? 'full_month',
    daysInMonth,
    interestDays: allocation?.interestDays ?? daysInMonth,
    partnerProfit: '0.00',
    managerProfit: '0.00',
    totalDividend: '0.00',
  }
}

export function calculateMemberMonthlyDetails(
  data: AppData,
  memberId: RecordId,
  year: number,
): MemberAnnualMonthlyDetail[] {
  const finalizedSettlementIds = finalizedSettlementIdsForYear(data, year)
  const settlementsById = new Map(
    data.monthlySettlements.map((settlement) => [settlement.id, normalizeMonthlySettlement(settlement)]),
  )
  const managerMember = data.members.find((member) => member.role === 'manager')
  const detailsByMonth = new Map<string, MemberAnnualMonthlyDetail>()

  for (const allocation of data.monthlyAllocations.filter((row) =>
    finalizedSettlementIds.has(row.settlementId),
  )) {
    if (!isMonthInAnnualPeriod(allocation.month, year)) {
      continue
    }

    if (allocation.memberRole === 'manager') {
      if (allocation.memberId !== memberId) {
        continue
      }

      const current =
        detailsByMonth.get(allocation.month) ??
        blankMonthlyDetail(allocation.month, settlementsById.get(allocation.settlementId), allocation)
      const managerOwnCapitalProfit = decimal(allocation.managerOwnCapitalProfit ?? allocation.monthlyProfit)
      current.partnerProfit = moneyString(decimal(current.partnerProfit).plus(managerOwnCapitalProfit))
      current.totalDividend = moneyString(decimal(current.totalDividend).plus(managerOwnCapitalProfit))
      detailsByMonth.set(allocation.month, current)
      continue
    }

    if (allocation.memberId === memberId) {
      const current =
        detailsByMonth.get(allocation.month) ??
        blankMonthlyDetail(allocation.month, settlementsById.get(allocation.settlementId), allocation)
      current.partnerProfit = moneyString(decimal(current.partnerProfit).plus(allocation.partnerProfit))
      current.totalDividend = moneyString(decimal(current.totalDividend).plus(allocation.partnerProfit))
      detailsByMonth.set(allocation.month, current)
    }

    if (managerMember?.id === memberId) {
      const managerSpecialProfit = decimal(allocation.managerSpecialProfit ?? 0)

      if (!managerSpecialProfit.isZero()) {
        const current =
          detailsByMonth.get(allocation.month) ??
          blankMonthlyDetail(allocation.month, settlementsById.get(allocation.settlementId), allocation)
        current.managerProfit = moneyString(decimal(current.managerProfit).plus(managerSpecialProfit))
        current.totalDividend = moneyString(decimal(current.totalDividend).plus(managerSpecialProfit))
        detailsByMonth.set(allocation.month, current)
      }
    }
  }

  if (managerMember?.id === memberId) {
    for (const settlement of data.monthlySettlements.filter(
      (item) => isFinalizedSettlementStatus(item.status) && isMonthInAnnualPeriod(item.month, year),
    )) {
      const normalized = normalizeMonthlySettlement(settlement)

      if (
        normalized.roundingAdjustmentTarget !== 'manager' ||
        decimal(normalized.roundingAdjustmentAmount).isZero()
      ) {
        continue
      }

      const current =
        detailsByMonth.get(normalized.month) ?? blankMonthlyDetail(normalized.month, normalized)
      current.managerProfit = moneyString(
        decimal(current.managerProfit).plus(normalized.roundingAdjustmentAmount),
      )
      current.totalDividend = moneyString(
        decimal(current.totalDividend).plus(normalized.roundingAdjustmentAmount),
      )
      detailsByMonth.set(normalized.month, current)
    }
  }

  return Array.from(detailsByMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
}

export function calculateMemberAnnualDetail(
  data: AppData,
  memberId: RecordId,
  year: number,
): MemberAnnualDetail {
  const member = data.members.find((item) => item.id === memberId)

  if (!member) {
    throw new Error('未找到合伙人。')
  }

  const snapshot = calculateCapitalSnapshot(data.members, data.capitalTransactions, `${year}-12`)
  const currentCapital = snapshot.find((row) => row.member.id === memberId)?.capital ?? '0.00'
  const monthlyDetails = calculateMemberMonthlyDetails(data, memberId, year)
  const adjustments = data.adjustmentRecords.filter(
    (record) => record.memberId === memberId && isMonthInAnnualPeriod(record.adjustmentMonth, year),
  )
  const summaryRow = calculateAnnualSummary(data, year).find((row) => row.memberId === memberId)

  return {
    member,
    year,
    currentCapital,
    capitalLots: data.capitalLots.filter((lot) => lot.memberId === memberId),
    monthlyDetails,
    adjustments,
    partnerProfit: summaryRow?.partnerProfit ?? '0.00',
    managerProfit: summaryRow?.managerProfit ?? '0.00',
    actualNetProfit: summaryRow?.actualNetProfit ?? '0.00',
    adjustmentAmount: summaryRow?.adjustmentAmount ?? '0.00',
    totalDividend: summaryRow?.totalDividend ?? '0.00',
    paidAmount: summaryRow?.paidAmount ?? '0.00',
    unpaidAmount: summaryRow?.unpaidAmount ?? '0.00',
  }
}

export function uniqueRateSnapshotSummary(
  data: AppData,
  year: number,
  field: 'partnerAnnualRate' | 'partnerMonthlyRateSnapshot',
): string {
  const rates = data.monthlySettlements
    .filter(
      (settlement) =>
        isFinalizedSettlementStatus(settlement.status) &&
        isMonthInAnnualPeriod(settlement.month, year),
    )
    .map((settlement) => normalizeMonthlySettlement(settlement)[field])
  const uniqueRates = Array.from(new Set(rates))

  return uniqueRates.join(' | ')
}

export function calculateAnnualDividendConfirmationDrafts(
  data: AppData,
  year: number,
): AnnualDividendConfirmationDraft[] {
  const confirmationsByMemberId = new Map(
    data.annualDividendConfirmations
      .filter((record) => record.year === year)
      .map((record) => [record.memberId, record]),
  )

  return data.members.map((member) => {
    const detail = calculateMemberAnnualDetail(data, member.id, year)
    const existing = confirmationsByMemberId.get(member.id)

    return {
      year,
      memberId: member.id,
      memberName: member.name,
      payableAmount: detail.totalDividend,
      paidAmount: detail.paidAmount,
      unpaidAmount: detail.unpaidAmount,
      adjustmentAmount: detail.adjustmentAmount,
      partnerAnnualRateSummary: uniqueRateSnapshotSummary(data, year, 'partnerAnnualRate'),
      partnerMonthlyRateSnapshotSummary: uniqueRateSnapshotSummary(
        data,
        year,
        'partnerMonthlyRateSnapshot',
      ),
      monthlyDetails: detail.monthlyDetails,
      status: existing?.status ?? 'not_generated',
      confirmationDate: existing?.confirmationDate,
      note: existing?.note,
    }
  })
}

export function calculateDashboardMetrics(
  data: AppData,
  year: number,
  asOfMonth: string,
): DashboardMetrics {
  const snapshot = calculateCapitalSnapshot(data.members, data.capitalTransactions, asOfMonth)
  const currentTotalCapital = snapshot.reduce(
    (sum, row) => sum.plus(decimal(row.capital)),
    new Decimal(0),
  )
  const lockedSettlements = data.monthlySettlements.filter(
    (settlement) =>
      isFinalizedSettlementStatus(settlement.status) && isMonthInAnnualPeriod(settlement.month, year),
  )
  const yearProfit = lockedSettlements.reduce(
    (sum, settlement) => sum.plus(settlement.totalProfit),
    new Decimal(0),
  )
  const pendingDividend = calculateAnnualSummary(data, year).reduce(
    (sum, row) => sum.plus(row.unpaidAmount),
    new Decimal(0),
  )
  const recentLockedMonth = lockedSettlements
    .map((settlement) => settlement.month)
    .sort()
    .at(-1) ?? '-'

  return {
    currentTotalCapital: moneyString(currentTotalCapital),
    yearProfit: moneyString(yearProfit),
    pendingDividend: moneyString(pendingDividend),
    lockedMonthCount: lockedSettlements.length,
    recentLockedMonth,
  }
}

export function settlementRecordId(month: string): string {
  return `settlement_${month}`
}

export function allocationRecordId(month: string, memberId: string, capitalLotId?: string): string {
  return `allocation_${month}_${memberId}_${capitalLotId ?? 'legacy'}`
}
