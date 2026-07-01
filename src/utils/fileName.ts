export function sanitizeFileNameSegment(value: string): string {
  const illegalChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
  const safe = value
    .split('')
    .map((char) => (illegalChars.has(char) || char.charCodeAt(0) < 32 ? '-' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  return safe || '未命名'
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function buildBackupFileName(date = new Date()): string {
  const timestamp = `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日-${pad(date.getHours())}${pad(date.getMinutes())}`

  return `合伙人收益系统备份-${timestamp}.json`
}

export function annualSummaryFileName(year: number): string {
  return `年度分红汇总-${year}.csv`
}

export function annualSummaryXlsxFileName(year: number): string {
  return `年度分红汇总-${year}.xlsx`
}

export function dividendPaymentsFileName(year: number): string {
  return `分红支付记录-${year}.csv`
}

export function dividendPaymentsXlsxFileName(year: number): string {
  return `分红支付记录-${year}.xlsx`
}

export function memberAnnualDetailFileName(memberName: string, year: number): string {
  return `合伙人年度明细-${sanitizeFileNameSegment(memberName)}-${year}.csv`
}

export function memberAnnualDetailXlsxFileName(memberName: string, year: number): string {
  return `合伙人年度明细-${sanitizeFileNameSegment(memberName)}-${year}.xlsx`
}

export function memberDividendSlipFileName(memberName: string, year: number): string {
  return `合伙人个人分红条-${sanitizeFileNameSegment(memberName)}-${year}.csv`
}

export function memberDividendSlipXlsxFileName(memberName: string, year: number): string {
  return `合伙人个人分红条-${sanitizeFileNameSegment(memberName)}-${year}.xlsx`
}

export function monthlySettlementFileName(year: number): string {
  return `月度结算明细-${year}年.csv`
}

export function monthlySettlementXlsxFileName(month: string): string {
  const [year, monthText] = month.split('-')

  return `月度结算明细-${year}年${Number(monthText)}月.xlsx`
}

export function monthlySettlementYearXlsxFileName(year: number): string {
  return `月度结算明细-${year}年.xlsx`
}

export function operationLogsFileName(year = new Date().getFullYear()): string {
  return `操作日志-${year}.csv`
}

export function operationLogsXlsxFileName(year = new Date().getFullYear()): string {
  return `操作日志-${year}.xlsx`
}

export function annualDividendConfirmationsXlsxFileName(year: number): string {
  return `年度分红确认单-${year}.xlsx`
}

export function profitCalculatorRecordsFileName(year = new Date().getFullYear()): string {
  return `收益计算器记录-${year}.csv`
}

export function profitCalculatorRecordsXlsxFileName(year = new Date().getFullYear()): string {
  return `收益计算器记录-${year}.xlsx`
}
