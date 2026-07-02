import { capitalLotFromTransaction, normalizeCapitalTransaction } from '../domain/calculation'
import type { CapitalLot, CapitalTransaction } from '../domain/types'
import { decimal, moneyString } from '../utils/decimal'

function normalizedMoneyKey(value: string): string {
  try {
    return moneyString(decimal(value))
  } catch {
    return value.trim()
  }
}

function lotBusinessKey(lot: Pick<CapitalLot, 'memberId' | 'amount' | 'startDate'>): string {
  return [lot.memberId, normalizedMoneyKey(lot.amount), lot.startDate].join('|')
}

export function mergeCapitalLotsWithDerivedTransactions(
  capitalLots: CapitalLot[],
  capitalTransactions: CapitalTransaction[],
): {
  mergedCapitalLots: CapitalLot[]
  normalizedTransactions: CapitalTransaction[]
  derivedMissingLots: CapitalLot[]
} {
  const normalizedTransactions = capitalTransactions.map(normalizeCapitalTransaction)
  const lotIds = new Set(capitalLots.map((lot) => lot.id))
  const lotBusinessKeys = new Set(capitalLots.map(lotBusinessKey))
  const derivedMissingLots = normalizedTransactions.flatMap((transaction) => {
    const lot = capitalLotFromTransaction(transaction)

    if (!lot) {
      return []
    }

    if (lotIds.has(lot.id) || lotBusinessKeys.has(lotBusinessKey(lot))) {
      return []
    }

    lotIds.add(lot.id)
    lotBusinessKeys.add(lotBusinessKey(lot))

    return [lot]
  })

  return {
    mergedCapitalLots: [...capitalLots, ...derivedMissingLots],
    normalizedTransactions,
    derivedMissingLots,
  }
}
