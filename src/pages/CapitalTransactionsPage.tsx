import { useMemo, useState } from 'react'
import { calculateCapitalSnapshot } from '../domain/calculation'
import type { CapitalTransaction, CapitalTransactionType } from '../domain/types'
import { validateCapitalTransaction } from '../domain/validation'
import { createId, currentMonth, nowIso, todayDate } from '../utils/date'
import { formatDate, formatMoney, formatMonth, memberStatusLabels } from '../utils/format'
import { Badge, Button, EmptyState, Field, Notice, PageHeader, Panel } from '../components/common'
import type { PageProps } from './pageTypes'

interface TransactionForm {
  memberId: string
  transactionDate: string
  effectiveMonth: string
  startDate: string
  type: CapitalTransactionType
  amount: string
  note: string
}

function blankForm(defaultMemberId = ''): TransactionForm {
  return {
    memberId: defaultMemberId,
    transactionDate: todayDate(),
    effectiveMonth: currentMonth(),
    startDate: todayDate(),
    type: 'deposit',
    amount: '',
    note: '',
  }
}

const typeLabels: Record<CapitalTransactionType, string> = {
  deposit: '入金',
  withdrawal: '退金',
  adjustment: '资金调整',
}

function monthFromDate(date: string): string {
  return date.slice(0, 7)
}

function nextMonthFromDate(date: string): string {
  if (!date) {
    return currentMonth()
  }

  const [year, month] = monthFromDate(date).split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))

  return next.toISOString().slice(0, 7)
}

export function CapitalTransactionsPage({ data, repository, reload, notify }: PageProps) {
  const firstMemberId = data.members[0]?.id ?? ''
  const [form, setForm] = useState<TransactionForm>(() => blankForm(firstMemberId))
  const [snapshotMonth, setSnapshotMonth] = useState(currentMonth())
  const [error, setError] = useState('')
  const membersById = useMemo(
    () => new Map(data.members.map((member) => [member.id, member])),
    [data.members],
  )
  const capitalSnapshot = useMemo(
    () => calculateCapitalSnapshot(data.members, data.capitalTransactions, snapshotMonth),
    [data.members, data.capitalTransactions, snapshotMonth],
  )

  function updateTransactionDate(transactionDate: string) {
    setForm((value) => ({
      ...value,
      transactionDate,
      effectiveMonth:
        value.type === 'withdrawal' ? nextMonthFromDate(transactionDate) : value.effectiveMonth,
    }))
  }

  function updateStartDate(startDate: string) {
    setForm((value) => ({
      ...value,
      startDate,
      effectiveMonth:
        value.type === 'withdrawal'
          ? value.effectiveMonth
          : startDate
            ? monthFromDate(startDate)
            : value.effectiveMonth,
    }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const payload = {
      ...form,
      memberId: form.memberId || firstMemberId,
    }
    const errors = validateCapitalTransaction(payload)

    if (errors.length > 0) {
      setError(errors.join(' '))
      return
    }

    const now = nowIso()
    const transaction: CapitalTransaction = {
      id: createId('capital_tx'),
      ...payload,
      amount: payload.amount.trim(),
      note: payload.note.trim(),
      createdAt: now,
      updatedAt: now,
    }

    await repository.saveCapitalTransaction(transaction)
    await reload()
    setForm(blankForm(payload.memberId))
    setError('')
    notify('资金流水已新增。')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="资金批次"
        description="录入入金、退金和资金调整。资金变动按生效月份参与结算，每次入金形成独立资金批次。"
      />

      {data.members.length === 0 ? (
        <Notice tone="warning">请先在合伙人管理页新增合伙人，再录入资金流水。</Notice>
      ) : null}

      <Panel title="新增资金流水" description="入金和退金金额填正数；资金调整可填正数或负数。">
        <form className="form-grid form-grid-wide" onSubmit={handleSubmit}>
          <Field label="人员">
            <select
              value={form.memberId || firstMemberId}
              onChange={(event) => setForm((value) => ({ ...value, memberId: event.target.value }))}
            >
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}{member.status === 'inactive' ? '（已停用）' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="交易日期">
            <input
              type="date"
              value={form.transactionDate}
              onChange={(event) => updateTransactionDate(event.currentTarget.value)}
              onInput={(event) => updateTransactionDate(event.currentTarget.value)}
            />
          </Field>
          <Field label="起息日期">
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => updateStartDate(event.currentTarget.value)}
              onInput={(event) => updateStartDate(event.currentTarget.value)}
            />
          </Field>
          <Field label="生效月份">
            <input
              type="month"
              value={form.effectiveMonth}
              onChange={(event) => setForm((value) => ({ ...value, effectiveMonth: event.target.value }))}
            />
          </Field>
          <Field label="类型">
            <select
              value={form.type}
              onChange={(event) => {
                const nextType = event.target.value as CapitalTransactionType
                setForm((value) => ({
                  ...value,
                  type: nextType,
                  effectiveMonth:
                    nextType === 'withdrawal'
                      ? nextMonthFromDate(value.transactionDate)
                      : value.startDate
                        ? monthFromDate(value.startDate)
                        : value.effectiveMonth,
                }))
              }}
            >
              <option value="deposit">新增入金</option>
              <option value="withdrawal">新增退金</option>
              <option value="adjustment">新增资金调整</option>
            </select>
          </Field>
          <Field label="金额">
            <input
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))}
              placeholder="例如：100000"
            />
          </Field>
          <Field label="备注">
            <input
              value={form.note}
              onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
              placeholder="可选"
            />
          </Field>
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={data.members.length === 0}>新增流水</Button>
          </div>
        </form>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Panel>

      <Panel
        title="生效本金快照"
        actions={
          <input
            className="compact-input"
            type="month"
            value={snapshotMonth}
            onChange={(event) => setSnapshotMonth(event.target.value)}
          />
        }
      >
        {capitalSnapshot.length === 0 ? (
          <EmptyState title="暂无本金数据" description="录入资金流水后可按月份查看生效本金。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>合伙人</th>
                  <th className="status-cell">角色</th>
                  <th className="status-cell">状态</th>
                  <th className="money-cell">截至该月本金</th>
                </tr>
              </thead>
              <tbody>
                {capitalSnapshot.map((row) => (
                  <tr key={row.member.id}>
                    <td className="strong-cell">{row.member.name}</td>
                    <td className="status-cell">{row.member.role === 'manager' ? '负责人' : '合伙人'}</td>
                    <td className="status-cell">{row.member.status === 'active' ? <Badge tone="success">{memberStatusLabels[row.member.status]}</Badge> : <Badge>{memberStatusLabels[row.member.status]}</Badge>}</td>
                    <td className="money-cell">{formatMoney(row.capital)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="流水记录" description="第一版不提供删除流水；需要修正时请新增资金调整。">
        {data.capitalTransactions.length === 0 ? (
          <EmptyState title="暂无资金流水" description="新增入金后即可进行月度结算。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>交易日期</th>
                  <th>起息日期</th>
                  <th>生效月份</th>
                  <th>人员</th>
                  <th>类型</th>
                  <th className="money-cell">金额</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {data.capitalTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.transactionDate)}</td>
                    <td>{formatDate(transaction.startDate)}</td>
                    <td>{formatMonth(transaction.effectiveMonth)}</td>
                    <td>{membersById.get(transaction.memberId)?.name ?? '未知人员'}</td>
                    <td>{typeLabels[transaction.type]}</td>
                    <td className={transaction.type === 'withdrawal' ? 'money-cell danger-text' : 'money-cell strong-number'}>
                      {transaction.type === 'withdrawal' ? '-' : ''}{formatMoney(transaction.amount)}
                    </td>
                    <td>{transaction.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
