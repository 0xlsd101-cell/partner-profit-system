import { describe, expect, it } from 'vitest'
import type { CapitalLot, CapitalTransaction } from '../domain/types'
import { mergeCapitalLotsWithDerivedTransactions } from './repositoryData'

const timestamp = '2026-07-01T00:00:00.000Z'

function transaction(input: Partial<CapitalTransaction>): CapitalTransaction {
  return {
    id: 'tx_1',
    memberId: 'member_1',
    transactionDate: '2026-07-01',
    effectiveMonth: '2026-07',
    startDate: '2026-07-01',
    type: 'deposit',
    amount: '100000',
    note: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  }
}

function capitalLot(input: Partial<CapitalLot>): CapitalLot {
  return {
    id: 'lot_1',
    memberId: 'member_1',
    amount: '100000.00',
    startDate: '2026-07-01',
    status: 'active',
    note: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  }
}

describe('repository data merging', () => {
  it('does not duplicate imported capital lots when transaction-derived ids differ', () => {
    const result = mergeCapitalLotsWithDerivedTransactions(
      [capitalLot({ id: 'lot_imported_1' })],
      [transaction({ id: 'tx_imported_1' })],
    )

    expect(result.mergedCapitalLots).toHaveLength(1)
    expect(result.derivedMissingLots).toHaveLength(0)
    expect(result.mergedCapitalLots[0]?.id).toBe('lot_imported_1')
  })

  it('derives capital lots for old data that only has capital transactions', () => {
    const result = mergeCapitalLotsWithDerivedTransactions([], [transaction({ id: 'legacy_tx_1' })])

    expect(result.mergedCapitalLots).toHaveLength(1)
    expect(result.derivedMissingLots).toHaveLength(1)
    expect(result.mergedCapitalLots[0]?.id).toBe('capital_lot_legacy_tx_1')
    expect(result.mergedCapitalLots[0]?.amount).toBe('100000.00')
  })

  it('normalizes missing transaction start dates before exposing them', () => {
    const result = mergeCapitalLotsWithDerivedTransactions(
      [],
      [transaction({ id: 'legacy_tx_2', startDate: '' })],
    )

    expect(result.normalizedTransactions[0]?.startDate).toBe('2026-07-01')
    expect(result.mergedCapitalLots[0]?.startDate).toBe('2026-07-01')
  })

  it('keeps separate lots for the same member on different start dates', () => {
    const result = mergeCapitalLotsWithDerivedTransactions(
      [capitalLot({ id: 'lot_20260701', startDate: '2026-07-01' })],
      [transaction({ id: 'tx_20260715', startDate: '2026-07-15' })],
    )

    expect(result.mergedCapitalLots.map((lot) => lot.startDate).sort()).toEqual([
      '2026-07-01',
      '2026-07-15',
    ])
  })

  it('keeps separate lots for the same member and date when amounts differ', () => {
    const result = mergeCapitalLotsWithDerivedTransactions(
      [capitalLot({ id: 'lot_100000', amount: '100000.00' })],
      [transaction({ id: 'tx_200000', amount: '200000' })],
    )

    expect(result.mergedCapitalLots).toHaveLength(2)
    expect(result.mergedCapitalLots.map((lot) => lot.amount).sort()).toEqual([
      '100000.00',
      '200000.00',
    ])
  })

  it('keeps separate lots for different members with the same date and amount', () => {
    const result = mergeCapitalLotsWithDerivedTransactions(
      [capitalLot({ id: 'lot_member_1', memberId: 'member_1' })],
      [transaction({ id: 'tx_member_2', memberId: 'member_2' })],
    )

    expect(result.mergedCapitalLots).toHaveLength(2)
    expect(result.mergedCapitalLots.map((lot) => lot.memberId).sort()).toEqual([
      'member_1',
      'member_2',
    ])
  })
})
