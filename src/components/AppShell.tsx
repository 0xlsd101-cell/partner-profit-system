import {
  Banknote,
  CalendarCheck,
  Calculator,
  CloudDownload,
  CreditCard,
  Gauge,
  LineChart,
  Menu,
  ScrollText,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge } from './common'
import {
  APP_NAME,
  applyRuntimeWindowTitle,
  appEditionLabel,
  appVersionLabel,
} from '../utils/runtimeInfo'

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

type NavItem = { key: PageKey; label: string; icon: typeof Gauge }

const navGroups: Array<{ label: string; items: NavItem[] }> = [
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
] 

const navItems: NavItem[] = navGroups.flatMap((group) => group.items)

interface AppShellProps {
  activePage: PageKey
  onPageChange: (page: PageKey) => void
  children: ReactNode
  toast?: string
}

export function AppShell({ activePage, onPageChange, children, toast }: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const activePageTitle = useMemo(
    () => navItems.find((item) => item.key === activePage)?.label ?? '首页总览',
    [activePage],
  )

  useEffect(() => {
    void applyRuntimeWindowTitle()
  }, [])

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [activePage])

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false)
      }
    }

    document.body.classList.add('mobile-nav-open')
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.classList.remove('mobile-nav-open')
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isMobileNavOpen])

  const renderNavigation = (variant: 'desktop' | 'mobile') => (
    <>
      <div className="brand">
        <div className="brand-mark">¥</div>
        <div>
          <strong>{APP_NAME}</strong>
          <span>{appEditionLabel()}</span>
        </div>
      </div>

      <nav className="nav-list" aria-label={variant === 'mobile' ? '移动端主导航' : '主导航'}>
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
        <span>{variant === 'mobile' ? `当前版本 ${appVersionLabel()}` : `无云同步 · ${appVersionLabel()}`}</span>
      </div>
    </>
  )

  return (
    <div className={isMobileNavOpen ? 'app-shell mobile-nav-is-open' : 'app-shell'}>
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="打开菜单"
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div className="mobile-topbar-title">
          <strong>{activePageTitle}</strong>
          <span>{APP_NAME} · {appEditionLabel()}</span>
        </div>
      </header>

      <button
        type="button"
        className="mobile-nav-backdrop"
        aria-label="关闭菜单"
        onClick={() => setIsMobileNavOpen(false)}
      />

      <aside className="sidebar desktop-sidebar">{renderNavigation('desktop')}</aside>

      <aside className="sidebar mobile-drawer" aria-hidden={!isMobileNavOpen}>
        <button
          type="button"
          className="mobile-drawer-close"
          aria-label="关闭菜单"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <X size={18} />
        </button>
        {renderNavigation('mobile')}
      </aside>

      <main className="main-area">
        {toast ? <div className="toast">{toast}</div> : null}
        <div className="content-frame">{children}</div>
      </main>
    </div>
  )
}
