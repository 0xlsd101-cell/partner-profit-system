/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  capitalLotStatusLabels,
  dividendPaymentStatusLabels,
  formatMoney,
  settlementStatusLabels,
} from '../utils/format'

const root = resolve(process.cwd(), 'src')

function source(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('Chinese visual interface text', () => {
  it('keeps the main menu in Chinese and includes the V0.9.2 cockpit entries', () => {
    const shell = source('components/AppShell.tsx')
    const menuLabels = [
      '首页总览',
      '合伙人管理',
      '资金批次',
      '月度结算',
      '年度汇总',
      '分红支付',
      '收益计算器',
      '数据备份',
      '操作日志',
      '系统设置',
    ]

    for (const label of menuLabels) {
      expect(shell).toContain(label)
    }

    expect(shell).toContain('日常操作')
    expect(shell).toContain('工具与系统')
  })

  it('registers the independent dividend payment, calculator and settings pages', () => {
    const app = source('app/App.tsx')

    expect(app).toContain('DividendPaymentsPage')
    expect(app).toContain('ProfitCalculatorPage')
    expect(app).toContain('SystemSettingsPage')
  })

  it('keeps the profit calculator as a single fixed navigation entry', () => {
    expect(source('components/AppShell.tsx')).toContain("label: '收益计算器'")
    expect(source('pages/DashboardPage.tsx')).not.toContain('ProfitCalculatorButton')
    expect(source('pages/AnnualSummaryPage.tsx')).not.toContain('ProfitCalculatorButton')
  })

  it('keeps required Chinese business copy on key pages', () => {
    expect(source('pages/DashboardPage.tsx')).toContain('关键数据概览')
    expect(source('pages/DashboardPage.tsx')).toContain('本月操作中枢')
    expect(source('pages/DashboardPage.tsx')).toContain('近期操作日志')
    expect(source('pages/DashboardPage.tsx')).toContain('全年外部资金差额留存')
    expect(source('pages/DashboardPage.tsx')).toContain('年度实际差额')
    expect(source('pages/DashboardPage.tsx')).toContain('年度尾差调整')
    expect(source('pages/MonthlySettlementPage.tsx')).toContain('本月实际可分配净收入')
    expect(source('pages/AnnualSummaryPage.tsx')).toContain('公历自然年度')
    expect(source('pages/MemberDetailPage.tsx')).toContain('分红条 Excel')
    expect(source('pages/BackupPage.tsx')).toContain('导入前请先导出当前完整备份')
    expect(source('pages/DividendPaymentsPage.tsx')).toContain('分红支付表')
    expect(source('pages/ProfitCalculatorPage.tsx')).toContain('自然年度清算模式')
    expect(source('pages/SystemSettingsPage.tsx')).toContain('系统设置')
  })

  it('keeps the local data clear confirmation copy clear and business-facing', () => {
    const backupPage = source('pages/BackupPage.tsx')
    const clearSafety = source('storage/dataClearSafety.ts')

    expect(clearSafety).toContain('危险操作：清除本地数据')
    expect(clearSafety).toContain('此操作将清除当前设备中的本地业务数据')
    expect(clearSafety).toContain('请先导出完整备份文件，再继续操作。')
    expect(clearSafety).toContain('清除后无法从当前设备恢复')
    expect(clearSafety).toContain('如果确认清除，请输入：')
    expect(clearSafety).toContain('确认清除本地数据')
    expect(backupPage).toContain('我已备份，确认清除')
    expect(backupPage).not.toContain('当前浏览器 IndexedDB')
  })

  it('does not expose a raw JSON editor on the backup page', () => {
    const backupPage = source('pages/BackupPage.tsx')

    expect(backupPage).not.toContain('<textarea')
    expect(backupPage).not.toContain('import-box')
    expect(backupPage).toContain('中文摘要')
  })

  it('keeps money formatting as thousands with two decimals', () => {
    expect(formatMoney('100000')).toBe('100,000.00')
    expect(formatMoney('-1234567.89')).toBe('-1,234,567.89')
  })

  it('keeps status labels in Chinese for ordinary user surfaces', () => {
    expect(settlementStatusLabels.draft).toBe('草稿')
    expect(settlementStatusLabels.locked).toBe('已锁定')
    expect(settlementStatusLabels.adjusted).toBe('已调整')
    expect(capitalLotStatusLabels.active).toBe('生效中')
    expect(capitalLotStatusLabels.withdrawn).toBe('已退出')
    expect(dividendPaymentStatusLabels.void).toBe('已取消')
  })

  it('defines the V0.9.2 cockpit design tokens in the global stylesheet', () => {
    const styles = source('index.css')

    expect(styles).toContain('--bg-primary')
    expect(styles).toContain('--panel-bg')
    expect(styles).toContain('--accent-cyan')
    expect(styles).toContain('--accent-gold')
    expect(styles).toContain('prefers-reduced-motion')
    expect(styles).toContain('dashboard-cockpit-header')
    expect(styles).toContain('dashboard-action-panel')
    expect(styles).toContain('cockpit-kpi-strip')
  })

  it('keeps the mobile navigation shell responsive and Chinese-facing', () => {
    const shell = source('components/AppShell.tsx')
    const styles = source('index.css')

    expect(shell).toContain('mobile-topbar')
    expect(shell).toContain('mobile-drawer')
    expect(shell).toContain('mobile-nav-backdrop')
    expect(shell).toContain('打开菜单')
    expect(shell).toContain('关闭菜单')
    expect(source('pages/DashboardPage.tsx')).toContain('role="button"')
    expect(styles).toContain('@media (max-width: 767px)')
    expect(styles).toContain('.desktop-sidebar')
    expect(styles).toContain('width: min(82vw, 300px)')
    expect(styles).toContain('--mobile-card-padding: 12px')
    expect(styles).toContain('V1.0.2 mobile app compact mode')
    expect(styles).toContain('min-height: 62px')
    expect(styles).toContain('min-width: 760px')
    expect(styles).toContain('overflow-x: hidden')
    expect(source('pages/MonthlySettlementPage.tsx')).toContain('本月实际可分配净收入')
    expect(source('pages/AnnualSummaryPage.tsx')).toContain('公历自然年度')
    expect(styles).not.toContain('partnerAnnualRate')
    expect(styles).not.toContain('actualDistributableNetIncome')
  })

  it('keeps manager special profit displayed from allocation details', () => {
    const monthlyPage = source('pages/MonthlySettlementPage.tsx')

    expect(monthlyPage).toContain('const managerSpecialProfit')
    expect(monthlyPage).toContain('allocation.managerSpecialProfit')
    expect(monthlyPage).not.toContain('formatMoney(calculation.settlement.managerProfit)')
  })
})
