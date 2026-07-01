import { useState } from 'react'
import {
  entityTypeLabel,
  formatDateTime,
  operationActionLabel,
  operationEntityText,
} from '../utils/format'
import { operationLogsFileName } from '../utils/fileName'
import { buildOperationLogsCsv, downloadTextFile } from '../storage/exportImport'
import { exportOperationLogsXlsx } from '../storage/xlsxReports'
import { Button, EmptyState, NumberStepperInput, PageHeader, Panel } from '../components/common'
import type { PageProps } from './pageTypes'

export function OperationLogsPage({ data, notify }: PageProps) {
  const [year, setYear] = useState(new Date().getFullYear())

  function exportLogsCsv() {
    downloadTextFile(
      operationLogsFileName(year),
      buildOperationLogsCsv(data),
      'text/csv;charset=utf-8',
    )
    notify('操作日志 CSV 已导出。')
  }

  async function exportLogsExcel() {
    await exportOperationLogsXlsx(data, year)
    notify('操作日志美化 Excel 已导出。')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="操作日志"
        description="记录关键账务动作，便于追溯；此页面只读，不修改任何业务数据。"
        actions={
          <div className="toolbar-row">
            <Button type="button" onClick={exportLogsCsv}>导出 CSV</Button>
            <Button type="button" onClick={exportLogsExcel}>导出美化 Excel</Button>
            <NumberStepperInput
              className="compact-input"
              value={year}
              aria-label="日志年份"
              onValueChange={(value) => setYear(Number(value))}
            />
          </div>
        }
      />

      <Panel title="最近操作记录" description="按操作时间倒序显示。">
        {data.operationLogs.length === 0 ? (
          <EmptyState title="暂无操作日志" description="新增、锁定、支付、备份等关键动作发生后会显示在这里。" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>操作时间</th>
                  <th>操作内容</th>
                  <th>业务对象</th>
                  <th>关联记录</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {data.operationLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{operationActionLabel(log.action)}</td>
                    <td>{entityTypeLabel(log.entityType)}</td>
                    <td>{operationEntityText(log.entityType, log.entityId)}</td>
                    <td>{log.note || '-'}</td>
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
