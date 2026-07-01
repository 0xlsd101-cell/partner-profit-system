import { useMemo, useState } from 'react'
import { calculateCapitalSnapshot } from '../domain/calculation'
import type { Member } from '../domain/types'
import { validateMemberName } from '../domain/validation'
import { createId, currentMonth, nowIso } from '../utils/date'
import { formatMoney, memberStatusLabels } from '../utils/format'
import { Badge, Button, EmptyState, Field, Notice, PageHeader, Panel } from '../components/common'
import type { PageProps } from './pageTypes'

interface MemberForm {
  name: string
  note: string
}

const blankForm: MemberForm = {
  name: '',
  note: '',
}

export function MembersPage({ data, repository, reload, notify }: PageProps) {
  const [form, setForm] = useState<MemberForm>(blankForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const capitalByMember = useMemo(() => {
    const snapshot = calculateCapitalSnapshot(data.members, data.capitalTransactions, currentMonth())
    return new Map(snapshot.map((row) => [row.member.id, row.capital]))
  }, [data.members, data.capitalTransactions])
  const manager = data.members.find((member) => member.role === 'manager')
  const editingMember = data.members.find((member) => member.id === editingId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const errors = validateMemberName(form.name)

    if (errors.length > 0) {
      setError(errors.join(' '))
      return
    }

    const now = nowIso()
    const member: Member = {
      id: editingMember?.id ?? createId('member'),
      name: form.name.trim(),
      note: form.note.trim(),
      role: editingMember?.role ?? 'partner',
      status: editingMember?.status ?? 'active',
      createdAt: editingMember?.createdAt ?? now,
      updatedAt: now,
    }

    await repository.saveMember(member)
    await reload()
    setForm(blankForm)
    setEditingId(null)
    setError('')
    notify(editingMember ? '合伙人已更新。' : '合伙人已新增。')
  }

  function startEdit(member: Member) {
    setEditingId(member.id)
    setForm({
      name: member.name,
      note: member.note,
    })
    setError('')
  }

  async function setAsManager(member: Member) {
    if (member.status === 'inactive') {
      setError('停用合伙人不能设置为负责人。')
      return
    }

    if (!window.confirm(`确认将「${member.name}」设为唯一负责人？其他合伙人的负责人角色会被取消。`)) {
      return
    }

    await repository.setManager(member.id)
    await reload()
    notify('负责人已更新。')
  }

  async function setStatus(member: Member, status: Member['status']) {
    if (status === 'inactive') {
      const ok = window.confirm(`确认停用「${member.name}」？历史流水和结算记录会保留。`)

      if (!ok) {
        return
      }
    }

    await repository.setMemberStatus(member.id, status)
    await reload()
    notify(status === 'active' ? '合伙人已启用。' : '合伙人已停用。')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="合伙人管理"
        description="新增、编辑、停用合伙人，并设置唯一负责人。"
      />

      <Panel title={editingId ? '编辑合伙人' : '新增合伙人'} description="第一版不做永久删除，停用后历史数据仍保留。">
        <form className="form-grid" onSubmit={handleSubmit}>
          <Field label="合伙人名称">
            <input
              value={form.name}
              onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
              placeholder="例如：张三"
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
            <Button type="submit" variant="primary">{editingId ? '保存修改' : '新增合伙人'}</Button>
            {editingId ? (
              <Button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(blankForm)
                  setError('')
                }}
              >
                取消编辑
              </Button>
            ) : null}
          </div>
        </form>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Panel>

      <Panel
        title="合伙人列表"
        description={manager ? `当前负责人：${manager.name}` : '尚未设置负责人。'}
      >
        {data.members.length === 0 ? (
          <EmptyState title="暂无合伙人" description="先新增合伙人，再录入资金流水。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th className="status-cell">角色</th>
                  <th className="status-cell">状态</th>
                  <th className="money-cell">当前本金</th>
                  <th>备注</th>
                  <th className="action-cell">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.id}>
                    <td className="strong-cell">{member.name}</td>
                    <td className="status-cell">{member.role === 'manager' ? <Badge tone="accent">负责人</Badge> : '合伙人'}</td>
                    <td className="status-cell">{member.status === 'active' ? <Badge tone="success">{memberStatusLabels[member.status]}</Badge> : <Badge>{memberStatusLabels[member.status]}</Badge>}</td>
                    <td className="money-cell">{formatMoney(capitalByMember.get(member.id) ?? '0')}</td>
                    <td>{member.note || '-'}</td>
                    <td className="action-cell">
                      <div className="row-actions member-action-grid">
                        <Button type="button" onClick={() => startEdit(member)}>编辑</Button>
                        {member.role !== 'manager' ? (
                          <Button type="button" onClick={() => setAsManager(member)}>设为负责人</Button>
                        ) : (
                          <span className="row-action-placeholder" aria-hidden="true" />
                        )}
                        {member.status === 'active' ? (
                          <Button type="button" variant="danger" onClick={() => setStatus(member, 'inactive')}>停用</Button>
                        ) : (
                          <Button type="button" onClick={() => setStatus(member, 'active')}>启用</Button>
                        )}
                      </div>
                    </td>
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
