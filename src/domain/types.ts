export type RecordId = string
export type YearMonth = `${number}-${string}`

export interface BaseRecord {
  id: RecordId
  createdAt: string
  updatedAt: string
}

export type MemberRole = 'manager' | 'partner'
export type MemberStatus = 'active' | 'inactive'

export interface Member extends BaseRecord {
  name: string
  role: MemberRole
  status: MemberStatus
  note: string
}

export type CapitalTransactionType = 'deposit' | 'withdrawal' | 'adjustment'

export interface CapitalTransaction extends BaseRecord {
  memberId: RecordId
  transactionDate: string
  effectiveMonth: string
  startDate: string
  type: CapitalTransactionType
  amount: string
  note: string
}

export type CapitalLotStatus = 'active' | 'withdrawn'

export interface CapitalLot extends BaseRecord {
  memberId: RecordId
  amount: string
  startDate: string
  status: CapitalLotStatus
  note?: string
}

export type ProrationType = 'full_month' | 'first_month_prorated' | 'not_started'

export type SettlementStatus = 'draft' | 'locked' | 'adjusted'
export type AllocationMode = 'auto_partner_rate' | 'manual_all_rates'
export type RateBasis = 'annual_simple'
export type RateConversionMethod = 'divide_by_12'
export type RetainedProfitHandling =
  | 'company_retained'
  | 'risk_reserve'
  | 'pending_distribution'
  | 'other'
export type ActualReconciliationStatus = 'not_entered' | 'draft' | 'confirmed'
export type RoundingAdjustmentTarget = 'manager' | 'company_retained'

export interface MonthlySettlement extends BaseRecord {
  month: string
  status: SettlementStatus
  allocationMode: AllocationMode
  /** Internal monthly total rate for the operating result. */
  totalRate: string
  /** Manager monthly special rate snapshot. */
  managerRate: string
  /** @deprecated Monthly partner rate snapshot. Use partnerAnnualRate for external display. */
  partnerRate: string
  partnerAnnualRate: string
  partnerMonthlyRateSnapshot: string
  rateBasis: RateBasis
  rateConversionMethod: RateConversionMethod
  retainedRate: string
  totalCapital: string
  totalProfit: string
  managerProfit: string
  partnerProfitPool: string
  retainedProfit: string
  retainedHandling: RetainedProfitHandling | ''
  roundingAdjustmentAmount: string
  roundingAdjustmentTarget: RoundingAdjustmentTarget
  roundingAdjustmentNote?: string
  actualDistributableNetIncome?: string
  /** @deprecated Use actualDistributableNetIncome. Kept for old IndexedDB/JSON backups. */
  actualDistributableIncome?: string
  externalPayableProfit: string
  managerTheoreticalProfit: string
  managerActualNetProfit?: string
  theoreticalTotalProfit: string
  actualIncomeDiff?: string
  managerNetDiff?: string
  actualReconciliationStatus: ActualReconciliationStatus
  actualIncomeNote?: string
  note: string
  lockedAt?: string
}

export interface MonthlyAllocation extends BaseRecord {
  settlementId: RecordId
  month: string
  memberId: RecordId
  memberName: string
  memberRole: MemberRole
  capitalLotId: RecordId
  originalCapital: string
  startDate: string
  prorationType: ProrationType
  daysInMonth: number
  interestDays: number
  prorationFactor: string
  equivalentCapital: string
  applicableRate: string
  memberCapital: string
  capitalRatio: string
  partnerProfit: string
  managerOwnCapitalProfit: string
  managerSpecialProfit: string
  totalProfit: string
  managerProfit: string
  monthlyProfit: string
}

export type DividendPaymentStatus = 'active' | 'void'

export interface DividendPayment extends BaseRecord {
  memberId: RecordId
  year: number
  payableAmount: string
  paidAmount: string
  unpaidAmount: string
  paymentDate: string
  paymentMethod: string
  transactionRef?: string
  note: string
  status: DividendPaymentStatus
  voidedAt?: string
  voidReason?: string
  /** @deprecated Use paymentDate. Kept for old IndexedDB/JSON backups. */
  paidAt?: string
  /** @deprecated Use paidAmount. Kept for old IndexedDB/JSON backups. */
  amount?: string
}

export type AdjustmentRecordType =
  | 'capital_adjustment'
  | 'profit_adjustment'
  | 'income_adjustment'
  | 'note_adjustment'

export interface AdjustmentRecord extends BaseRecord {
  targetMonth: string
  adjustmentMonth: string
  memberId?: RecordId
  type: AdjustmentRecordType
  amount: string
  reason: string
}

export type AnnualDividendConfirmationStatus =
  | 'not_generated'
  | 'generated'
  | 'sent'
  | 'confirmed'
  | 'paid'
  | 'archived'

export interface AnnualDividendConfirmation extends BaseRecord {
  year: number
  memberId: RecordId
  payableAmount: string
  paidAmount: string
  unpaidAmount: string
  adjustmentAmount: string
  status: AnnualDividendConfirmationStatus
  confirmationDate?: string
  note?: string
}

export interface OperationLog {
  id: RecordId
  action: string
  entityType: string
  entityId: RecordId
  beforeSnapshot?: string
  afterSnapshot?: string
  note?: string
  createdAt: string
}

export interface ProfitCalculatorInput {
  memberId?: RecordId
  investmentAmount: string
  annualRate: string
  startDate: string
  settlementCycleMonths: string
  settlementYear?: string
  calculatorMode?: 'cycle_months' | 'calendar_year'
  note?: string
}

export interface ProfitCalculatorResult {
  calculatorMode?: 'cycle_months' | 'calendar_year'
  periodStartDate?: string
  periodEndDate?: string
  monthlyRate: string
  firstMonthDays: number
  firstMonthInterestDays: number
  firstMonthProfit: string
  fullMonthCount: string
  fullMonthProfit: string
  totalProfit: string
  principalPlusProfit: string
}

export interface ProfitCalculatorRecord
  extends BaseRecord,
    ProfitCalculatorInput,
    ProfitCalculatorResult {
  recordType: 'calculator_record'
}

export interface AppData {
  members: Member[]
  capitalLots: CapitalLot[]
  capitalTransactions: CapitalTransaction[]
  monthlySettlements: MonthlySettlement[]
  monthlyAllocations: MonthlyAllocation[]
  dividendPayments: DividendPayment[]
  adjustmentRecords: AdjustmentRecord[]
  annualDividendConfirmations: AnnualDividendConfirmation[]
  operationLogs: OperationLog[]
  profitCalculatorRecords: ProfitCalculatorRecord[]
}

export interface CapitalSnapshotRow {
  member: Member
  capital: string
}

export interface MonthlyCalculationInput {
  members: Member[]
  capitalLots?: CapitalLot[]
  capitalTransactions: CapitalTransaction[]
  month: string
  allocationMode?: AllocationMode
  totalRate: string
  managerRate: string
  partnerAnnualRate?: string
  /** @deprecated Monthly partner rate snapshot, kept for old callers/backups. */
  partnerRate?: string
  retainedHandling?: RetainedProfitHandling | ''
  actualDistributableNetIncome?: string
  /** @deprecated Use actualDistributableNetIncome. */
  actualDistributableIncome?: string
  actualIncomeNote?: string
  actualReconciliationStatus?: ActualReconciliationStatus
  settlementId?: string
}

export interface MonthlyCalculationResult {
  settlement: Omit<MonthlySettlement, keyof BaseRecord | 'status' | 'note' | 'lockedAt'>
  allocations: Omit<MonthlyAllocation, keyof BaseRecord>[]
  capitalSnapshot: CapitalSnapshotRow[]
}

export interface AnnualSummaryRow {
  memberId: RecordId
  memberName: string
  memberRole: MemberRole
  partnerProfit: string
  managerProfit: string
  actualNetProfit: string
  adjustmentAmount: string
  totalDividend: string
  paidAmount: string
  unpaidAmount: string
}

export interface AnnualSummaryResult {
  rows: AnnualSummaryRow[]
  retainedProfit: string
  roundingAdjustmentAmount: string
  managerTheoreticalProfit: string
  managerActualNetProfit: string
  managerNetDiff: string
  annualAdjustmentAmount: string
  unassignedAdjustmentAmount: string
}

export interface MemberAnnualMonthlyDetail {
  month: string
  partnerAnnualRate: string
  partnerMonthlyRateSnapshot: string
  prorationType: ProrationType
  daysInMonth: number
  interestDays: number
  partnerProfit: string
  managerProfit: string
  totalDividend: string
}

export interface MemberAnnualDetail {
  member: Member
  year: number
  currentCapital: string
  capitalLots: CapitalLot[]
  monthlyDetails: MemberAnnualMonthlyDetail[]
  adjustments: AdjustmentRecord[]
  partnerProfit: string
  managerProfit: string
  actualNetProfit: string
  adjustmentAmount: string
  totalDividend: string
  paidAmount: string
  unpaidAmount: string
}

export interface AnnualDividendConfirmationDraft {
  year: number
  memberId: RecordId
  memberName: string
  payableAmount: string
  paidAmount: string
  unpaidAmount: string
  adjustmentAmount: string
  partnerAnnualRateSummary: string
  partnerMonthlyRateSnapshotSummary: string
  monthlyDetails: MemberAnnualMonthlyDetail[]
  status: AnnualDividendConfirmationStatus
  confirmationDate?: string
  note?: string
}

export interface DashboardMetrics {
  currentTotalCapital: string
  yearProfit: string
  pendingDividend: string
  lockedMonthCount: number
  recentLockedMonth: string
}

export const emptyAppData: AppData = {
  members: [],
  capitalLots: [],
  capitalTransactions: [],
  monthlySettlements: [],
  monthlyAllocations: [],
  dividendPayments: [],
  adjustmentRecords: [],
  annualDividendConfirmations: [],
  operationLogs: [],
  profitCalculatorRecords: [],
}
