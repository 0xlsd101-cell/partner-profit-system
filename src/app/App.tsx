import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell, type PageKey } from '../components/AppShell'
import { emptyAppData, type AppData } from '../domain/types'
import { createPartnerRepository } from '../storage/repositoryFactory'
import { AnnualSummaryPage } from '../pages/AnnualSummaryPage'
import { BackupPage } from '../pages/BackupPage'
import { CapitalTransactionsPage } from '../pages/CapitalTransactionsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DividendPaymentsPage } from '../pages/DividendPaymentsPage'
import { MembersPage } from '../pages/MembersPage'
import { MonthlySettlementPage } from '../pages/MonthlySettlementPage'
import { MemberDetailPage } from '../pages/MemberDetailPage'
import { OperationLogsPage } from '../pages/OperationLogsPage'
import { ProfitCalculatorPage } from '../pages/ProfitCalculatorPage'
import { SystemSettingsPage } from '../pages/SystemSettingsPage'

function App() {
  const repository = useMemo(() => createPartnerRepository(), [])
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [data, setData] = useState<AppData>(emptyAppData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const nextData = await repository.getData()
      setData(nextData)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取本地数据失败。')
    } finally {
      setLoading(false)
    }
  }, [repository])

  useEffect(() => {
    void reload()
  }, [reload])

  const pageProps = {
    data,
    repository,
    reload,
    notify,
    navigate: setActivePage,
  }

  let content = <DashboardPage {...pageProps} />

  if (activePage === 'members') {
    content = <MembersPage {...pageProps} />
  } else if (activePage === 'memberDetail') {
    content = <MemberDetailPage {...pageProps} />
  } else if (activePage === 'capital') {
    content = <CapitalTransactionsPage {...pageProps} />
  } else if (activePage === 'monthly') {
    content = <MonthlySettlementPage {...pageProps} />
  } else if (activePage === 'annual') {
    content = <AnnualSummaryPage {...pageProps} />
  } else if (activePage === 'dividendPayments') {
    content = <DividendPaymentsPage {...pageProps} />
  } else if (activePage === 'profitCalculator') {
    content = <ProfitCalculatorPage {...pageProps} />
  } else if (activePage === 'operationLogs') {
    content = <OperationLogsPage {...pageProps} />
  } else if (activePage === 'backup') {
    content = <BackupPage {...pageProps} />
  } else if (activePage === 'settings') {
    content = <SystemSettingsPage />
  }

  return (
    <AppShell activePage={activePage} onPageChange={setActivePage} toast={toast}>
      {loading ? <div className="loading">正在读取本地数据...</div> : null}
      {error ? <div className="fatal-error">{error}</div> : content}
    </AppShell>
  )
}

export default App
