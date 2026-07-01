export type ExcelCellValue = string | number | boolean | null | undefined

export interface ExcelTableDefinition {
  title?: string
  headers: string[]
  rows: ExcelCellValue[][]
}

export interface ExcelSheetDefinition {
  name: string
  title?: string
  summaryRows?: Array<[string, ExcelCellValue]>
  tables?: ExcelTableDefinition[]
  notes?: string[]
}

export interface ExcelReportDefinition {
  fileName: string
  title: string
  sheets: ExcelSheetDefinition[]
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const APP_NAME = '合伙人月度收益计算与年度分红汇总系统'
const MONEY_NUM_FORMAT = '#,##0.00;[Red]-#,##0.00'
const RATE_NUM_FORMAT = '0.00%'
const INTEGER_NUM_FORMAT = '#,##0'

function isNegativeValue(value: ExcelCellValue): boolean {
  return (typeof value === 'number' && value < 0) || (typeof value === 'string' && value.trim().startsWith('-'))
}

export type ExcelMessageTone = 'normal' | 'warning' | 'risk' | 'neutral'

export function classifyExcelMessageTone(values: ExcelCellValue[]): ExcelMessageTone {
  const text = values
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim()

  if (!text) {
    return 'neutral'
  }

  if (/未发现.*风险|无.*风险|正常|通过|无异常|已完成|完成|已确认/.test(text)) {
    return 'normal'
  }

  if (/不足|异常|失败|错误|低于|超出|超额|负数|风险/.test(text)) {
    return 'risk'
  }

  if (/差额过大|请补充|建议|提醒|待处理|需核对/.test(text)) {
    return 'warning'
  }

  return 'neutral'
}

function applyMessageToneStyle(cell: import('exceljs').Cell, tone: ExcelMessageTone): void {
  if (tone === 'neutral') {
    return
  }

  const styleByTone: Record<Exclude<ExcelMessageTone, 'neutral'>, { fill: string; font: string }> = {
    normal: { fill: 'FFDCFCE7', font: 'FF166534' },
    warning: { fill: 'FFFEF3C7', font: 'FF92400E' },
    risk: { fill: 'FFFEE2E2', font: 'FFB91C1C' },
  }
  const style = styleByTone[tone]

  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }
  cell.font = {
    ...(cell.font ?? {}),
    color: { argb: style.font },
    bold: tone === 'risk' || cell.font?.bold,
  }
}

function addCellBorder(cell: import('exceljs').Cell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  }
}

function applyWorkbookStyle(workbook: import('exceljs').Workbook): void {
  workbook.creator = APP_NAME
  workbook.company = APP_NAME
  workbook.subject = '本地导出报表'
  workbook.created = new Date()
  workbook.modified = new Date()
}

function applyColumnWidths(worksheet: import('exceljs').Worksheet): void {
  worksheet.columns.forEach((column) => {
    let maxLength = 10

    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value
      const text = value === null || value === undefined ? '' : String(value)
      maxLength = Math.max(maxLength, Math.min(36, text.length + 4))
    })

    column.width = maxLength
  })
}

function isRateHeader(header: string): boolean {
  return /收益率|比例/.test(header)
}

function isMoneyHeader(header: string): boolean {
  return !isRateHeader(header) && /金额|收益|分红|本金|应付|已支付|待支付|尾差|留存|净收益|合计/.test(header)
}

function isIntegerHeader(header: string): boolean {
  return /数量|次数|天数|月数|月份数|后续整月数|参与月份/.test(header)
}

function isDateHeader(header: string): boolean {
  return /日期|时间|月份|年度|开始日|截止日/.test(header)
}

function parseFiniteNumberText(value: string): { numericValue: number; integerDigits: number } | null {
  const normalized = value.trim().replace(/,/g, '')

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null
  }

  const integerPart = normalized.replace(/^-/, '').split('.')[0] ?? ''
  const integerDigits = integerPart.replace(/^0+(?=\d)/, '').length
  const numericValue = Number(normalized)

  if (!Number.isFinite(numericValue)) {
    return null
  }

  return { numericValue, integerDigits }
}

function parseMoneyLikeValue(value: ExcelCellValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const parsed = parseFiniteNumberText(value)

  if (!parsed || parsed.integerDigits > 15) {
    return null
  }

  return parsed.numericValue
}

function parsePercentLikeValue(value: ExcelCellValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed.endsWith('%')) {
    return null
  }

  const parsed = parseFiniteNumberText(trimmed.slice(0, -1))

  return parsed ? parsed.numericValue / 100 : null
}

function parseIntegerLikeValue(value: ExcelCellValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const parsed = parseFiniteNumberText(value)

  if (!parsed || parsed.integerDigits > 15 || !Number.isInteger(parsed.numericValue)) {
    return null
  }

  return parsed.numericValue
}

function applyCellValueFormat(cell: import('exceljs').Cell, header: string): void {
  const value = cell.value as ExcelCellValue

  if (isRateHeader(header)) {
    const numericValue = parsePercentLikeValue(value)

    if (numericValue !== null) {
      cell.value = numericValue
      cell.numFmt = RATE_NUM_FORMAT
    }

    return
  }

  if (isMoneyHeader(header)) {
    const numericValue = parseMoneyLikeValue(value)

    if (numericValue !== null) {
      cell.value = numericValue
      cell.numFmt = MONEY_NUM_FORMAT
    }

    return
  }

  if (isIntegerHeader(header)) {
    const numericValue = parseIntegerLikeValue(value)

    if (numericValue !== null) {
      cell.value = numericValue
      cell.numFmt = INTEGER_NUM_FORMAT
    }
  }
}

function alignTableRow(row: import('exceljs').Row, headers: string[]): void {
  row.eachCell((cell, columnNumber) => {
    const header = headers[columnNumber - 1] ?? ''
    applyCellValueFormat(cell, header)
    cell.alignment = {
      vertical: 'middle',
      horizontal:
        isMoneyHeader(header) || isRateHeader(header) || isIntegerHeader(header)
          ? 'right'
          : isDateHeader(header)
            ? 'center'
            : 'left',
      wrapText: true,
    }

    addCellBorder(cell)

    if (isNegativeValue(cell.value as ExcelCellValue)) {
      cell.font = { color: { argb: 'FFB91C1C' }, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
    }
  })
}

function addTitle(worksheet: import('exceljs').Worksheet, title: string, columnCount: number): void {
  const row = worksheet.addRow([title])
  const lastColumn = Math.max(1, columnCount)

  worksheet.mergeCells(row.number, 1, row.number, lastColumn)
  row.height = 30
  row.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
}

function addSummaryRows(worksheet: import('exceljs').Worksheet, rows: Array<[string, ExcelCellValue]>): void {
  if (rows.length === 0) {
    return
  }

  const titleRow = worksheet.addRow(['摘要'])
  titleRow.getCell(1).font = { bold: true, color: { argb: 'FF0F172A' } }
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }

  for (const rowValues of rows) {
    const row = worksheet.addRow(rowValues)
    const label = String(rowValues[0] ?? '')
    const tone = classifyExcelMessageTone(rowValues)

    applyCellValueFormat(row.getCell(2), label)
    row.getCell(1).font = { bold: true, color: { argb: 'FF334155' } }
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    row.eachCell((cell, columnNumber) => {
      const shouldAlignSummaryValueRight =
        columnNumber === 2 && (isMoneyHeader(label) || isRateHeader(label) || isIntegerHeader(label))

      cell.alignment = {
        vertical: 'middle',
        horizontal: shouldAlignSummaryValueRight ? 'right' : 'left',
        wrapText: true,
      }
      addCellBorder(cell)
      applyMessageToneStyle(cell, tone)

      if (isNegativeValue(cell.value as ExcelCellValue)) {
        cell.font = { ...(cell.font ?? {}), color: { argb: 'FFB91C1C' }, bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
      }
    })
  }

  worksheet.addRow([])
}

function addTable(worksheet: import('exceljs').Worksheet, table: ExcelTableDefinition): void {
  if (table.title) {
    const titleRow = worksheet.addRow([table.title])
    titleRow.getCell(1).font = { bold: true, color: { argb: 'FF0F172A' } }
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
  }

  const headerRow = worksheet.addRow(table.headers)
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3B5A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    addCellBorder(cell)
  })

  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: table.headers.length },
  }

  for (const values of table.rows) {
    const row = worksheet.addRow(values)
    const tone = classifyExcelMessageTone(values)

    alignTableRow(row, table.headers)

    if (tone !== 'neutral') {
      row.eachCell((cell) => {
        applyMessageToneStyle(cell, tone)
      })
    }
  }

  worksheet.addRow([])
}

function addNotes(worksheet: import('exceljs').Worksheet, notes: string[]): void {
  if (notes.length === 0) {
    return
  }

  const titleRow = worksheet.addRow(['说明'])
  titleRow.getCell(1).font = { bold: true, color: { argb: 'FF0F172A' } }
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }

  for (const note of notes) {
    const row = worksheet.addRow([note])
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    addCellBorder(row.getCell(1))
  }
}

async function createExcelWorkbook(report: ExcelReportDefinition): Promise<import('exceljs').Workbook> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()

  applyWorkbookStyle(workbook)

  for (const sheet of report.sheets) {
    const columnCount = Math.max(
      2,
      ...(sheet.tables ?? []).map((table) => table.headers.length),
      ...(sheet.summaryRows ?? []).map(() => 2),
    )
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 20 },
    })

    addTitle(worksheet, sheet.title ?? `${report.title} - ${sheet.name}`, columnCount)
    addSummaryRows(worksheet, sheet.summaryRows ?? [])

    for (const table of sheet.tables ?? []) {
      addTable(worksheet, table)
    }

    addNotes(worksheet, sheet.notes ?? [])
    applyColumnWidths(worksheet)
  }

  return workbook
}

export async function buildExcelReportBuffer(report: ExcelReportDefinition): Promise<BlobPart> {
  const workbook = await createExcelWorkbook(report)
  const buffer = await workbook.xlsx.writeBuffer()

  return buffer as BlobPart
}

export async function downloadExcelReport(report: ExcelReportDefinition): Promise<void> {
  const buffer = await buildExcelReportBuffer(report)
  const blob = new Blob([buffer as BlobPart], { type: MIME_XLSX })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = report.fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
