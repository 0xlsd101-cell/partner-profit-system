import {
  Banknote,
  CalendarCheck,
  Calculator,
  CloudDownload,
  CreditCard,
  Gauge,
  LineChart,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from './common'

export type PageKey =
  | 'dashboard'
  | 'members'
  | 'memberDetail'
  | 'capital'
  | 'monthly'
  | 'annual'
  | 'dividendPayments'
  | 'profitCalculator'
  | 'operationLogs'
  | 'backup'
  | 'settings'

const navGroups = [
  {
    label: '日常操作',
    items: [
      { key: 'dashboard', label: '首页总览', icon: Gauge },
      { key: 'members', label: '合伙人管理', icon: Users },
      { key: 'capital', label: '资金批次', icon: Banknote },
      { key: 'monthly', label: '月度结算', icon: CalendarCheck },
      { key: 'annual', label: '年度汇总', icon: LineChart },
      { key: 'dividendPayments', label: '分红支付', icon: CreditCard },
    ],
  },
  {
    label: '工具与系统',
    items: [
      { key: 'profitCalculator', label: '收益计算器', icon: Calculator },
      { key: 'backup', label: '数据备份', icon: CloudDownload },
      { key: 'operationLogs', label: '操作日志', icon: ScrollText },
      { key: 'settings', label: '系统设置', icon: Settings },
    ],
  },
] satisfies Array<{ label: string; items: Array<{ key: PageKey; label: string; icon: typeof Gauge }> }>

interface AppShellProps {
  activePage: PageKey
  onPageChange: (page: PageKey) => void
  children: ReactNode
  toast?: string
}

export function AppShell({ activePage, onPageChange, children, toast }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">¥</div>
          <div>
            <strong>合伙人收益系统</strong>
            <span>本地版</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={item.key === activePage ? 'nav-item nav-item-active' : 'nav-item'}
                    onClick={() => onPageChange(item.key)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Badge tone="success">本地数据</Badge>
          <span>无云同步 · 无登录</span>
        </div>
      </aside>

      <main className="main-area">
        {toast ? <div className="toast">{toast}</div> : null}
        <div className="content-frame">{children}</div>
      </main>
    </div>
  )
}
