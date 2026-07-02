import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Notice, PageHeader, Panel } from '../components/common'
import {
  APP_VERSION,
  desktopSqlitePathLabel,
  runtimeModeLabel,
  storageModeLabel,
} from '../utils/runtimeInfo'

const ruleGroups = [
  {
    title: '年度周期',
    items: ['公历自然年度', '每年 1 月 1 日至 12 月 31 日'],
  },
  {
    title: '收益率口径',
    items: ['普通合伙人使用年化单利收益率', '折合月收益率 = 年化收益率 ÷ 12'],
  },
  {
    title: '计息规则',
    items: ['月中加入首月按天折算', '第二个月开始按整月计息', '入金当天计息'],
  },
  {
    title: '负责人规则',
    items: ['负责人自有资金按本月总收益率', '负责人专项收益基于非负责人折算本金'],
  },
  {
    title: '数据安全规则',
    items: ['已锁定 / 已调整月份不可直接修改', '历史修正通过调整记录处理', '备份文件仅用于导出和恢复，不在普通页面展示原文'],
  },
]

export function SystemSettingsPage() {
  const [sqlitePath, setSqlitePath] = useState('正在读取本地数据库位置...')

  useEffect(() => {
    let ignore = false

    desktopSqlitePathLabel().then((path) => {
      if (!ignore) {
        setSqlitePath(path)
      }
    })

    return () => {
      ignore = true
    }
  }, [])

  const runtimeRows = [
    `当前版本：V${APP_VERSION}`,
    `运行模式：${runtimeModeLabel()}`,
    `存储模式：${storageModeLabel()}`,
    `本地数据库：${sqlitePath}`,
  ]

  return (
    <div className="page-stack">
      <PageHeader
        title="系统设置"
        description="当前版本仅展示系统规则摘要，不提供修改业务规则的开关。"
        actions={<Badge tone="success">只读展示</Badge>}
      />

      <Notice tone="info">
        此页面用于确认当前账务口径。修改收益规则、年度周期或历史修正规则需要通过后续版本设计，不在本页直接调整。
      </Notice>

      <Panel title="运行环境">
        <ul className="rule-list">
          {runtimeRows.map((item) => (
            <li key={item}>
              <ShieldCheck size={16} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="rule-grid">
        {ruleGroups.map((group) => (
          <Panel key={group.title} title={group.title}>
            <ul className="rule-list">
              {group.items.map((item) => (
                <li key={item}>
                  <ShieldCheck size={16} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  )
}
