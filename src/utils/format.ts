import { decimal } from './decimal'
import type {
  ActualReconciliationStatus,
  AdjustmentRecordType,
  AnnualDividendConfirmationStatus,
  CapitalLotStatus,
  DividendPaymentStatus,
  MemberStatus,
  ProrationType,
  RoundingAdjustmentTarget,
  SettlementStatus,
} from '../domain/types'

function formatDecimalAmount(value: string | number | null | undefined): string {
  try {
    const fixed = decimal(value ?? 0).toFixed(2)
    const sign = fixed.startsWith('-') ? '-' : ''
    const unsigned = sign ? fixed.slice(1) : fixed
    const [integerPart, fractionPart = '00'] = unsigned.split('.')
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    return `${sign}${groupedInteger}.${fractionPart}`
  } catch {
    return '0.00'
  }
}

export function formatMoney(value: string | number | null | undefined): string {
  return formatDecimalAmount(value)
}

export function formatPlainMoney(value: string | number | null | undefined): string {
  return formatDecimalAmount(value)
}

export function formatRate(value: string | number): string {
  return `${decimal(value).mul(100).toFixed(2)}%`
}

export function formatRatio(value: string | number): string {
  return `${decimal(value).mul(100).toFixed(2)}%`
}

function toNumberText(value: string): number {
  return Number(value)
}

export function formatDate(value?: string): string {
  if (!value) {
    return '-'
  }

  const [datePart] = value.split('T')
  const [year, month, day] = datePart.split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${year}年${toNumberText(month)}月${toNumberText(day)}日`
}

export function formatMonth(value?: string): string {
  if (!value || !value.includes('-')) {
    return value ?? '-'
  }

  const [year, month] = value.split('-')

  return `${year}年${toNumberText(month)}月`
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return formatDate(value)
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const settlementStatusLabels: Record<SettlementStatus, string> = {
  draft: '草稿',
  locked: '已锁定',
  adjusted: '已调整',
}

export const memberStatusLabels: Record<MemberStatus, string> = {
  active: '生效中',
  inactive: '已停用',
}

export const capitalLotStatusLabels: Record<CapitalLotStatus, string> = {
  active: '生效中',
  withdrawn: '已退出',
}

export const dividendPaymentStatusLabels: Record<DividendPaymentStatus, string> = {
  active: '生效中',
  void: '已取消',
}

export const actualReconciliationStatusLabels: Record<ActualReconciliationStatus, string> = {
  not_entered: '未录入',
  draft: '草稿',
  confirmed: '已确认',
}

export const annualConfirmationStatusLabels: Record<AnnualDividendConfirmationStatus, string> = {
  not_generated: '未生成',
  generated: '已生成',
  sent: '已发送',
  confirmed: '已确认',
  paid: '已支付',
  archived: '已归档',
}

export const adjustmentTypeLabels: Record<AdjustmentRecordType, string> = {
  capital_adjustment: '本金调整',
  profit_adjustment: '收益调整',
  income_adjustment: '实际收入调整',
  note_adjustment: '备注调整',
}

export const prorationTypeLabels: Record<ProrationType, string> = {
  full_month: '整月计息',
  first_month_prorated: '首月折算',
  not_started: '未起息',
}

export const roundingAdjustmentTargetLabels: Record<RoundingAdjustmentTarget, string> = {
  manager: '负责人',
  company_retained: '公司留存',
}

export function paymentMethodLabel(value?: string): string {
  const labels: Record<string, string> = {
    bank_transfer: '银行转账',
    cash: '现金',
    wechat: '微信',
    alipay: '支付宝',
    other: '其他',
  }

  return value ? labels[value] ?? value : '-'
}

export function operationActionLabel(value: string): string {
  const labels: Record<string, string> = {
    member_create: '新增合伙人',
    member_update: '修改合伙人',
    member_set_manager: '设置负责人',
    member_status_update: '调整合伙人状态',
    capital_transaction_create: '新增资金流水',
    capital_transaction_update: '修改资金流水',
    capital_lot_create: '新增资金批次',
    capital_lot_update: '修改资金批次',
    monthly_settlement_save: '保存月度结算草稿',
    monthly_settlement_locked: '锁定月度结算',
    adjustment_record_create: '新增调整记录',
    actual_net_income_save: '录入实际可分配净收入',
    dividend_payment_create: '记录分红支付',
    dividend_payment_update: '修改分红支付',
    dividend_payment_void: '取消分红支付',
    annual_confirmation_create: '新增分红确认单',
    annual_confirmation_update: '更新分红确认单',
    annual_confirmation_generate: '生成分红确认单',
    backup_export: '导出备份',
    backup_import: '导入备份',
    local_data_clear: '清除本地数据',
  }

  return labels[value] ?? '系统操作'
}

export function entityTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    member: '合伙人',
    capitalTransaction: '资金流水',
    capitalLot: '资金批次',
    monthlySettlement: '月度结算',
    adjustmentRecord: '调整记录',
    dividendPayment: '分红支付记录',
    annualDividendConfirmation: '年度分红确认单',
    backup: '备份文件',
    system: '系统数据',
  }

  return labels[value] ?? '业务记录'
}

export function operationEntityText(entityType: string, entityId: string): string {
  if (entityType === 'monthlySettlement' && entityId.startsWith('settlement_')) {
    return formatMonth(entityId.replace('settlement_', ''))
  }

  if (entityType === 'backup') {
    return '本地备份'
  }

  if (entityType === 'system') {
    return '本地系统数据'
  }

  return `${entityTypeLabel(entityType)}记录`
}

export function percentInputToRate(value: string): string {
  return decimal(value || '0').div(100).toString()
}

export function rateToPercentInput(value: string): string {
  return decimal(value || '0').mul(100).toString()
}

export function csvCell(value: unknown): string {
  const text = String(value ?? '')

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }

  return text
}
