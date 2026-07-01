import {
  allocationRecordId,
  capitalLotFromTransaction,
  calculateMonthlySettlement,
  settlementRecordId,
} from '../domain/calculation'
import type {
  AppData,
  CapitalTransaction,
  DividendPayment,
  Member,
  MonthlyAllocation,
  MonthlySettlement,
} from '../domain/types'

const createdAt = '2026-01-01T00:00:00.000Z'

export function createSampleData(): AppData {
  const members: Member[] = [
    {
      id: 'sample_member_manager',
      name: '张三',
      role: 'manager',
      status: 'active',
      note: '负责人，同时出资',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'sample_member_li',
      name: '李四',
      role: 'partner',
      status: 'active',
      note: '',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'sample_member_wang',
      name: '王五',
      role: 'partner',
      status: 'active',
      note: '',
      createdAt,
      updatedAt: createdAt,
    },
  ]
  const capitalTransactions: CapitalTransaction[] = [
    {
      id: 'sample_tx_manager_deposit',
      memberId: 'sample_member_manager',
      transactionDate: '2026-01-01',
      effectiveMonth: '2026-01',
      startDate: '2026-01-01',
      type: 'deposit',
      amount: '600000',
      note: '初始入金',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'sample_tx_li_deposit',
      memberId: 'sample_member_li',
      transactionDate: '2026-01-01',
      effectiveMonth: '2026-01',
      startDate: '2026-01-01',
      type: 'deposit',
      amount: '400000',
      note: '初始入金',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'sample_tx_wang_deposit',
      memberId: 'sample_member_wang',
      transactionDate: '2026-02-10',
      effectiveMonth: '2026-03',
      startDate: '2026-03-01',
      type: 'deposit',
      amount: '200000',
      note: '3 月起参与分配',
      createdAt,
      updatedAt: createdAt,
    },
  ]
  const { settlement, allocations } = calculateMonthlySettlement({
    members,
    capitalLots: capitalTransactions.flatMap((transaction) => {
      const lot = capitalLotFromTransaction(transaction)
      return lot ? [lot] : []
    }),
    capitalTransactions,
    month: '2026-01',
    totalRate: '0.025',
    managerRate: '0.02',
    settlementId: settlementRecordId('2026-01'),
  })
  const monthlySettlement: MonthlySettlement = {
    ...settlement,
    id: settlementRecordId('2026-01'),
    status: 'locked',
    note: '演示数据：1 月已锁定',
    lockedAt: '2026-01-31T12:00:00.000Z',
    createdAt,
    updatedAt: createdAt,
  }
  const monthlyAllocations: MonthlyAllocation[] = allocations.map((allocation) => ({
    ...allocation,
    id: allocationRecordId('2026-01', allocation.memberId, allocation.capitalLotId),
    settlementId: monthlySettlement.id,
    createdAt,
    updatedAt: createdAt,
  }))
  const dividendPayments: DividendPayment[] = [
    {
      id: 'sample_payment_manager',
      memberId: 'sample_member_manager',
      year: 2026,
      payableAmount: '23000.00',
      paidAmount: '5000',
      unpaidAmount: '18000.00',
      paymentDate: '2026-12-31',
      paymentMethod: 'bank_transfer',
      transactionRef: 'DEMO-001',
      note: '演示：部分支付',
      status: 'active',
      paidAt: '2026-12-31',
      amount: '5000',
      createdAt,
      updatedAt: createdAt,
    },
  ]

  return {
    members,
    capitalLots: capitalTransactions.flatMap((transaction) => {
      const lot = capitalLotFromTransaction(transaction)
      return lot ? [lot] : []
    }),
    capitalTransactions,
    monthlySettlements: [monthlySettlement],
    monthlyAllocations,
    dividendPayments,
    adjustmentRecords: [],
    annualDividendConfirmations: [],
    operationLogs: [],
    profitCalculatorRecords: [],
  }
}
