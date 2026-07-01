import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CirclePlus,
  ClipboardCheck,
  Clock3,
  Coins,
  DatabaseBackup,
  FileText,
  ListChecks,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react'
import {
  calculateAnnualSummaryResult,
  calculateCapitalSnapshot,
  calculateDashboardMetrics,
  isActualIncomeDiffLarge,
  isMonthInAnnualPeriod,
  normalizeDividendPayment,
} from '../domain/calculation'
import { decimal, moneyString } from '../utils/decimal'
import { currentMonth } from '../utils/date'
import {
  dividendPaymentStatusLabels,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMonth,
  formatRate,
  operationActionLabel,
  operationEntityText,
  paymentMethodLabel,
  settlementStatusLabels,
} from '../utils/format'
import { Badge, Button, EmptyState } from '../components/common'
import type { PageProps } from './pageTypes'

type CockpitTone = 'cyan' | 'gold' | 'green' | 'blue' | 'purple' | 'red'

interface CockpitStatCardProps {
  icon: ReactNode
  label: string
  value: ReactNode
  meta: ReactNode
  tone?: CockpitTone
}

interface KpiTileProps {
  label: string
  value: ReactNode
  detail: ReactNode
  tone?: CockpitTone
}

interface ActionStepProps {
  step: string
  title: string
  description: string
  status: string
  statusTone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
  actionLabel: string
  icon: ReactNode
  onClick: () => void
}

function CockpitStatCard({ icon, label, value, meta, tone = 'cyan' }: CockpitStatCardProps) {
  return (
    <div className={`cockpit-stat-card cockpit-tone-${tone}`}>
      <div className="cockpit-card-heading">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  )
}

function KpiTile({ label, value, detail, tone = 'cyan' }: KpiTileProps) {
  return (
    <div className={`cockpit-kpi-tile cockpit-tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function ActionStepCard({
  step,
  title,
  description,
  status,
  statusTone,
  actionLabel,
  icon,
  onClick,
}: ActionStepProps) {
  return (
    <article className="dashboard-action-card">
      <div className="action-step-index">{step}</div>
      <div className="action-step-icon">{icon}</div>
      <div className="action-step-content">
        <div className="action-step-title-row">
          <h3>{title}</h3>
          <Badge tone={statusTone}>{status}</Badge>
        </div>
        <p>{description}</p>
        <Button type="button" variant="ghost" onClick={onClick}>
          {actionLabel}
          <ArrowRight size={15} />
        </Button>
      </div>
    </article>
  )
}

function riskToneText(tone: 'warning' | 'success' | 'danger') {
  if (tone === 'danger') {
    return '高风险'
  }

  if (tone === 'warning') {
    return '需核对'
  }

  return '正常'
}

export function DashboardPage({ data, navigate }: PageProps) {
  const year = new Date().getFullYear()
  const activeMonth = currentMonth()
  const metrics = calculateDashboardMetrics(data, year, activeMonth)
  const annualSummary = calculateAnnualSummaryResult(data, year)
  const capitalSnapshot = calculateCapitalSnapshot(data.members, data.capitalTransactions, activeMonth)
  const managerMember = data.members.find((member) => member.role === 'manager')
  const managerIds = new Set(data.members.filter((member) => member.role === 'manager').map((member) => member.id))
  const managerCapital = moneyString(
    capitalSnapshot.reduce(
      (sum, row) => (managerIds.has(row.member.id) ? sum.plus(row.capital) : sum),
      decimal(0),
    ),
  )
  const externalCapital = moneyString(
    capitalSnapshot.reduce(
      (sum, row) => (managerIds.has(row.member.id) ? sum : sum.plus(row.capital)),
      decimal(0),
    ),
  )
  const totalCapitalDecimal = decimal(metrics.currentTotalCapital)
  const externalCapitalRatio = totalCapitalDecimal.gt(0)
    ? decimal(externalCapital).div(totalCapitalDecimal).toString()
    : '0'
  const managerCapitalRatio = totalCapitalDecimal.gt(0)
    ? decimal(managerCapital).div(totalCapitalDecimal).toString()
    : '0'
  const recentSettlements = [...data.monthlySettlements]
    .filter((settlement) => settlement.status === 'locked' || settlement.status === 'adjusted')
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 5)
  const finalizedSettlements = data.monthlySettlements.filter(
    (settlement) => settlement.status === 'locked' || settlement.status === 'adjusted',
  )
  const externalPayableProfit = moneyString(
    finalizedSettlements
      .filter((settlement) => isMonthInAnnualPeriod(settlement.month, year))
      .reduce((sum, settlement) => sum.plus(settlement.externalPayableProfit ?? 0), decimal(0)),
  )
  const latestBackupLog = data.operationLogs.find((log) => log.action === 'backup_export')
  const latestBackupAt = latestBackupLog?.createdAt
  const backupIsStale =
    !latestBackupAt || Date.now() - new Date(latestBackupAt).getTime() > 30 * 24 * 60 * 60 * 1000
  const draftMonths = data.monthlySettlements
    .filter((settlement) => settlement.status === 'draft')
    .map((settlement) => settlement.month)
    .sort()
  const missingActualIncomeMonths = finalizedSettlements
    .filter(
      (settlement) =>
        settlement.actualReconciliationStatus === 'not_entered' ||
        (!settlement.actualDistributableNetIncome && !settlement.actualDistributableIncome),
    )
    .map((settlement) => settlement.month)
    .sort()
  const negativeActualIncomeMonths = finalizedSettlements
    .filter((settlement) => settlement.managerActualNetProfit && decimal(settlement.managerActualNetProfit).lt(0))
    .map((settlement) => settlement.month)
    .sort()
  const largeDiffWithoutNoteMonths = finalizedSettlements
    .filter((settlement) => isActualIncomeDiffLarge(settlement) && !settlement.actualIncomeNote?.trim())
    .map((settlement) => settlement.month)
    .sort()
  const recentPayments = [...data.dividendPayments]
    .sort((a, b) => (b.paymentDate ?? b.paidAt ?? '').localeCompare(a.paymentDate ?? a.paidAt ?? ''))
    .slice(0, 5)
  const recentLogs = [...data.operationLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
  const currentSettlement = data.monthlySettlements.find((settlement) => settlement.month === activeMonth)
  const activeMemberCount = data.members.filter((member) => member.status === 'active').length
  const activeCapitalLotCount = data.capitalLots.filter((lot) => lot.status !== 'withdrawn').length
  const withdrawnCapitalLotCount = data.capitalLots.filter((lot) => lot.status === 'withdrawn').length
  const currentYearAdjustmentCount = data.adjustmentRecords.filter((record) =>
    isMonthInAnnualPeriod(record.adjustmentMonth, year),
  ).length
  const currentYearLogCount = data.operationLogs.filter((log) => log.createdAt.startsWith(String(year))).length
  const annualPaidAmount = moneyString(
    annualSummary.rows.reduce((sum, row) => sum.plus(row.paidAmount), decimal(0)),
  )
  const currentActualIncomeText = (() => {
    if (!currentSettlement) {
      return '需先创建结算'
    }

    if (currentSettlement.actualReconciliationStatus === 'confirmed') {
      return '已确认'
    }

    if (currentSettlement.actualDistributableNetIncome || currentSettlement.actualDistributableIncome) {
      return '已录入'
    }

    return '未录入'
  })()
  const currentActualIncomeTone =
    currentActualIncomeText === '已确认' || currentActualIncomeText === '已录入' ? 'success' : 'warning'

  const riskItems = [
    {
      label: '未锁定月份',
      value: draftMonths.length > 0 ? draftMonths.map(formatMonth).join('、') : '暂无',
      tone: draftMonths.length > 0 ? 'warning' : 'success',
    },
    {
      label: '未录入实际可分配净收入月份',
      value:
        missingActualIncomeMonths.length > 0
          ? missingActualIncomeMonths.map(formatMonth).join('、')
          : '暂无',
      tone: missingActualIncomeMonths.length > 0 ? 'warning' : 'success',
    },
    {
      label: '备份状态',
      value: backupIsStale ? '超过 30 天未备份或暂无备份记录' : '备份状态正常',
      tone: backupIsStale ? 'warning' : 'success',
    },
    {
      label: '实际收入低于对外应付收益',
      value:
        negativeActualIncomeMonths.length > 0
          ? negativeActualIncomeMonths.map(formatMonth).join('、')
          : '暂无',
      tone: negativeActualIncomeMonths.length > 0 ? 'danger' : 'success',
    },
    {
      label: '差额过大但未备注',
      value:
        largeDiffWithoutNoteMonths.length > 0
          ? largeDiffWithoutNoteMonths.map(formatMonth).join('、')
          : '暂无',
      tone: largeDiffWithoutNoteMonths.length > 0 ? 'warning' : 'success',
    },
  ] as const
  const riskCount = riskItems.filter((item) => item.tone !== 'success').length
  const dataStatusText = riskCount > 0 ? `需核对 ${riskCount} 项` : '正常'

  return (
    <div className="page-stack dashboard-cockpit">
      <header className="dashboard-cockpit-header">
        <div className="dashboard-title-panel">
          <div className="page-status-line">
            <span>当前年度：{year}年</span>
            <span>公历自然年度：1月1日 至 12月31日</span>
            <span>本地存储</span>
          </div>
          <h1>首页总览</h1>
          <p>查看当前本金、年度收益、风险提醒和最近账务动作。</p>
        </div>

        <div className="dashboard-status-cluster" aria-label="系统状态">
          <div className={`dashboard-status-pill ${riskCount > 0 ? 'status-warning' : 'status-success'}`}>
            <span className="status-dot" />
            <span>数据状态：</span>
            <strong>{dataStatusText}</strong>
          </div>
          <div className="dashboard-status-pill">
            <Clock3 size={16} />
            <span>系统时间：</span>
            <strong>{formatDateTime(new Date().toISOString())}</strong>
          </div>
          <div className="dashboard-status-pill">
            <ShieldCheck size={16} />
            <strong>数据已本地存储</strong>
          </div>
        </div>
      </header>

      <div className="dashboard-stat-grid">
        <CockpitStatCard
          icon={<WalletCards size={24} />}
          label="当前总本金"
          value={formatMoney(metrics.currentTotalCapital)}
          meta="按当前月份资金流水汇总"
        />
        <CockpitStatCard
          icon={<Users size={24} />}
          label="对外合伙人本金"
          value={formatMoney(externalCapital)}
          meta={`占比 ${formatRate(externalCapitalRatio)}`}
          tone="blue"
        />
        <CockpitStatCard
          icon={<UserRound size={24} />}
          label="负责人本金"
          value={formatMoney(managerCapital)}
          meta={`占比 ${formatRate(managerCapitalRatio)}`}
          tone="purple"
        />
        <CockpitStatCard
          icon={<Activity size={24} />}
          label="本年累计理论收益"
          value={formatMoney(metrics.yearProfit)}
          meta="仅统计已锁定 / 已调整月份"
          tone="cyan"
        />
        <CockpitStatCard
          icon={<Coins size={24} />}
          label="本年对外应付收益"
          value={formatMoney(externalPayableProfit)}
          meta={`已支付 ${formatMoney(annualPaidAmount)}`}
          tone="gold"
        />
        <CockpitStatCard
          icon={<ShieldCheck size={24} />}
          label="负责人本年实际净收益"
          value={formatMoney(annualSummary.managerActualNetProfit)}
          meta="已录入实际收入月份合计"
          tone="green"
        />
        <CockpitStatCard
          icon={<CalendarDays size={24} />}
          label="已锁定月份数量"
          value={`${metrics.lockedMonthCount} / 12`}
          meta={`最近：${metrics.recentLockedMonth === '-' ? '-' : formatMonth(metrics.recentLockedMonth)}`}
          tone="purple"
        />
        <CockpitStatCard
          icon={<DatabaseBackup size={24} />}
          label="最近备份时间"
          value={latestBackupAt ? formatDateTime(latestBackupAt) : '暂无记录'}
          meta={backupIsStale ? '建议立即导出完整备份' : '30 天内已有备份'}
          tone={backupIsStale ? 'red' : 'green'}
        />
      </div>

      <section className="dashboard-action-panel">
        <div className="cockpit-table-heading">
          <div>
            <ClipboardCheck size={18} />
            <h2>本月操作中枢</h2>
          </div>
          <span className="action-panel-hint">按顺序处理即可，不需要在菜单中来回查找。</span>
        </div>
        <div className="dashboard-action-grid">
          <ActionStepCard
            step="01"
            title="合伙人"
            description="先维护参与分配的人员和负责人。"
            status={activeMemberCount > 0 ? `${activeMemberCount} 人生效中` : '待新增'}
            statusTone={activeMemberCount > 0 ? 'success' : 'warning'}
            actionLabel={activeMemberCount > 0 ? '查看合伙人' : '新增合伙人'}
            icon={<Users size={18} />}
            onClick={() => navigate('members')}
          />
          <ActionStepCard
            step="02"
            title="资金批次"
            description="录入入金起息日，系统按首月折算。"
            status={activeCapitalLotCount > 0 ? `${activeCapitalLotCount} 批生效中` : '待录入'}
            statusTone={activeCapitalLotCount > 0 ? 'success' : 'warning'}
            actionLabel={activeCapitalLotCount > 0 ? '查看资金' : '新增资金'}
            icon={<CirclePlus size={18} />}
            onClick={() => navigate('capital')}
          />
          <ActionStepCard
            step="03"
            title="月度结算"
            description="核对收益率、折算本金和分配明细。"
            status={currentSettlement ? settlementStatusLabels[currentSettlement.status] : '本月未创建'}
            statusTone={currentSettlement ? 'success' : 'warning'}
            actionLabel={currentSettlement ? '继续核对' : '创建结算'}
            icon={<CalendarDays size={18} />}
            onClick={() => navigate('monthly')}
          />
          <ActionStepCard
            step="04"
            title="实际收入"
            description="录入本月实际可分配净收入并核对负责人净收益。"
            status={currentActualIncomeText}
            statusTone={currentActualIncomeTone}
            actionLabel="去月度结算"
            icon={<ShieldCheck size={18} />}
            onClick={() => navigate('monthly')}
          />
          <ActionStepCard
            step="05"
            title="年度分红"
            description="查看年度应分红、已支付和待支付金额。"
            status={decimal(metrics.pendingDividend).gt(0) ? '有待支付收益' : '暂无待支付'}
            statusTone={decimal(metrics.pendingDividend).gt(0) ? 'warning' : 'success'}
            actionLabel="查看年度汇总"
            icon={<Coins size={18} />}
            onClick={() => navigate('annual')}
          />
          <ActionStepCard
            step="06"
            title="数据备份"
            description="锁定或支付前后建议导出完整备份。"
            status={backupIsStale ? '建议备份' : '备份正常'}
            statusTone={backupIsStale ? 'warning' : 'success'}
            actionLabel="打开备份"
            icon={<DatabaseBackup size={18} />}
            onClick={() => navigate('backup')}
          />
        </div>
      </section>

      <div className="dashboard-mid-grid">
        <section className="cockpit-risk-panel">
          <div className="cockpit-section-heading">
            <AlertTriangle size={32} />
            <div>
              <h2>风险提示</h2>
              <p>页面仅提示风险，不自动修改任何账务数据。</p>
            </div>
          </div>
          <ul className="risk-command-list">
            {riskItems.map((item) => (
              <li key={item.label} className={`risk-command-item risk-tone-${item.tone}`}>
                <span>{riskToneText(item.tone)}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.value}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="cockpit-overview-panel">
          <div className="cockpit-section-title">
            <span />
            <h2>关键数据概览</h2>
          </div>
          <div className="cockpit-kpi-strip">
            <KpiTile
              label="合伙人数量"
              value={activeMemberCount}
              detail={`负责人：${managerMember?.name ?? '未设置'}`}
            />
            <KpiTile
              label="资金批次数量"
              value={activeCapitalLotCount}
              detail={`已退出 ${withdrawnCapitalLotCount}`}
              tone="blue"
            />
            <KpiTile
              label="本月结算本金"
              value={formatMoney(currentSettlement?.totalCapital ?? '0.00')}
              detail={currentSettlement ? settlementStatusLabels[currentSettlement.status] : '未创建月度结算'}
              tone="gold"
            />
            <KpiTile
              label="本月分配金额"
              value={formatMoney(currentSettlement?.externalPayableProfit ?? '0.00')}
              detail={formatMonth(activeMonth)}
              tone="gold"
            />
            <KpiTile
              label="待支付收益"
              value={formatMoney(metrics.pendingDividend)}
              detail="年度汇总口径"
              tone={decimal(metrics.pendingDividend).gt(0) ? 'red' : 'green'}
            />
            <KpiTile
              label="全年外部资金差额留存"
              value={formatMoney(annualSummary.retainedProfit)}
              detail="仅统计已锁定 / 已调整月份"
              tone="gold"
            />
            <KpiTile
              label="年度实际差额"
              value={formatMoney(annualSummary.managerNetDiff)}
              detail="负责人实际净收益 - 理论收益"
              tone={decimal(annualSummary.managerNetDiff).lt(0) ? 'red' : 'green'}
            />
            <KpiTile
              label="年度尾差调整"
              value={formatMoney(annualSummary.roundingAdjustmentAmount)}
              detail="尾差归属：负责人"
              tone={decimal(annualSummary.roundingAdjustmentAmount).isZero() ? 'green' : 'purple'}
            />
            <KpiTile
              label="调整记录数量"
              value={currentYearAdjustmentCount}
              detail={`${year} 年度`}
              tone="purple"
            />
            <KpiTile
              label="操作日志数量"
              value={currentYearLogCount}
              detail="本年度记录"
              tone="blue"
            />
          </div>
        </section>
      </div>

      <div className="dashboard-table-grid">
        <section className="cockpit-table-panel">
          <div className="cockpit-table-heading">
            <div>
              <FileText size={18} />
              <h2>最近结算记录</h2>
            </div>
            <Button type="button" variant="ghost" onClick={() => navigate('monthly')}>查看全部结算记录</Button>
          </div>
          {recentSettlements.length === 0 ? (
            <EmptyState title="暂无锁定结算" description="到月度结算页保存并锁定后，会出现在这里。" />
          ) : (
            <div className="table-wrap cockpit-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>结算月份</th>
                    <th className="money-cell">结算本金</th>
                    <th className="money-cell">理论收益</th>
                    <th className="status-cell">锁定状态</th>
                    <th>锁定时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSettlements.map((settlement) => (
                    <tr key={settlement.id}>
                      <td>{formatMonth(settlement.month)}</td>
                      <td className="money-cell">{formatMoney(settlement.totalCapital)}</td>
                      <td className="money-cell strong-number">{formatMoney(settlement.totalProfit)}</td>
                      <td className="status-cell">
                        <Badge tone={settlement.status === 'adjusted' ? 'accent' : 'success'}>
                          {settlementStatusLabels[settlement.status]}
                        </Badge>
                      </td>
                      <td>{formatDateTime(settlement.lockedAt ?? settlement.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cockpit-table-panel">
          <div className="cockpit-table-heading">
            <div>
              <Banknote size={18} />
              <h2>最近支付记录</h2>
            </div>
            <Button type="button" variant="ghost" onClick={() => navigate('dividendPayments')}>查看全部支付记录</Button>
          </div>
          {recentPayments.length === 0 ? (
            <EmptyState title="暂无支付记录" description="记录年度分红支付后会显示在这里。" />
          ) : (
            <div className="table-wrap cockpit-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>支付日期</th>
                    <th>支付方式</th>
                    <th className="money-cell">支付金额</th>
                    <th>支付对象</th>
                    <th className="status-cell">支付状态</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => {
                    const normalized = normalizeDividendPayment(payment)

                    return (
                      <tr key={payment.id}>
                        <td>{formatDate(normalized.paymentDate)}</td>
                        <td>{paymentMethodLabel(normalized.paymentMethod)}</td>
                        <td className="money-cell strong-number">{formatMoney(normalized.paidAmount)}</td>
                        <td>{data.members.find((member) => member.id === payment.memberId)?.name ?? '未知人员'}</td>
                        <td className="status-cell">
                          <Badge tone={normalized.status === 'void' ? 'danger' : 'success'}>
                            {dividendPaymentStatusLabels[normalized.status]}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cockpit-table-panel cockpit-log-panel">
          <div className="cockpit-table-heading">
            <div>
              <ListChecks size={18} />
              <h2>近期操作日志</h2>
            </div>
            <Button type="button" variant="ghost" onClick={() => navigate('operationLogs')}>更多日志</Button>
          </div>
          {recentLogs.length === 0 ? (
            <EmptyState title="暂无操作日志" description="新增、锁定、支付、备份等动作会显示在这里。" />
          ) : (
            <div className="dashboard-log-list">
              {recentLogs.map((log) => (
                <div key={log.id} className="dashboard-log-item">
                  <span className="log-status-dot" />
                  <div>
                    <strong>{operationActionLabel(log.action)}</strong>
                    <small>{formatDateTime(log.createdAt)}</small>
                  </div>
                  <em>{operationEntityText(log.entityType, log.entityId)}</em>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
