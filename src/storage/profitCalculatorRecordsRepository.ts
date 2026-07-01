import type { ProfitCalculatorRecord } from '../domain/types'

export interface ProfitCalculatorRecordsRepository {
  saveProfitCalculatorRecord(record: ProfitCalculatorRecord): Promise<void>
}
