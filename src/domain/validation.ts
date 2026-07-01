import type {
  CapitalTransaction,
  Member,
  MonthlyCalculationResult,
  SettlementStatus,
} from './types'
import { decimal, isDecimalLike } from '../utils/decimal'

export function validateSingleManager(members: Member[]): string[] {
  const managerCount = members.filter((member) => member.role === 'manager').length

  if (managerCount > 1) {
    return ['负责人只能有一个。']
  }

  return []
}

export function validateMemberName(name: string): string[] {
  if (!name.trim()) {
    return ['合伙人名称不能为空。']
  }

  return []
}

export function validateCapitalTransaction(
  transaction: Pick<CapitalTransaction, 'memberId' | 'transactionDate' | 'effectiveMonth' | 'startDate' | 'type' | 'amount'>,
): string[] {
  const errors: string[] = []

  if (!transaction.memberId) {
    errors.push('请选择合伙人。')
  }

  if (!transaction.transactionDate) {
    errors.push('交易日期不能为空。')
  }

  if (!transaction.effectiveMonth) {
    errors.push('生效月份不能为空。')
  }

  if (!transaction.startDate) {
    errors.push('起息日期不能为空。')
  }

  if (!isDecimalLike(transaction.amount)) {
    errors.push('金额必须是有效数字。')
  } else if (transaction.type !== 'adjustment' && decimal(transaction.amount).lte(0)) {
    errors.push('入金和退金金额必须大于 0。')
  } else if (transaction.type === 'adjustment' && decimal(transaction.amount).isZero()) {
    errors.push('资金调整金额不能为 0。')
  }

  return errors
}

export function validateSettlementInput(
  result: MonthlyCalculationResult,
  targetStatus: SettlementStatus = 'draft',
): string[] {
  const errors: string[] = []
  const { settlement, capitalSnapshot } = result

  if (decimal(settlement.totalCapital).lte(0)) {
    errors.push('总本金必须大于 0。')
  }

  if (decimal(settlement.totalRate).lt(0)) {
    errors.push('月总收益率不能小于 0。')
  }

  if (decimal(settlement.managerRate).lt(0)) {
    errors.push('负责人专项月收益率快照不能小于 0。')
  }

  if (decimal(settlement.partnerAnnualRate).lt(0)) {
    errors.push('普通合伙人年化收益率不能小于 0。')
  }

  if (decimal(settlement.partnerMonthlyRateSnapshot).lt(0)) {
    errors.push('普通合伙人折合月收益率不能小于 0。')
  }

  if (targetStatus === 'locked' && decimal(settlement.retainedRate).lt(0)) {
    errors.push('外部资金差额留存率不能小于 0，当前为超分配状态，禁止锁定。')
  }

  if (
    targetStatus === 'locked' &&
    decimal(settlement.retainedRate).gt(0) &&
    !settlement.retainedHandling
  ) {
    errors.push('存在外部资金差额留存时，锁定前必须选择处理方式。')
  }

  if (targetStatus === 'locked' && settlement.actualIncomeDiff) {
    const theoreticalTotalProfit = decimal(settlement.theoreticalTotalProfit).abs()
    const actualIncomeDiff = decimal(settlement.actualIncomeDiff).abs()

    if (
      theoreticalTotalProfit.gt(0) &&
      actualIncomeDiff.gt(theoreticalTotalProfit.mul('0.1')) &&
      !settlement.actualIncomeNote?.trim()
    ) {
      errors.push('实际可分配净收入与理论总收益差额超过 10% 时，必须填写实际收入备注。')
    }
  }

  for (const row of capitalSnapshot) {
    if (decimal(row.capital).lt(0)) {
      errors.push(`${row.member.name} 的生效本金为负数，请先用资金流水修正。`)
    }
  }

  return errors
}
