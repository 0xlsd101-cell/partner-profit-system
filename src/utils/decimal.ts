import Decimal from 'decimal.js'

Decimal.set({
  precision: 32,
  rounding: Decimal.ROUND_HALF_UP,
})

export function decimal(value: Decimal.Value): Decimal {
  if (value === '' || value === null || value === undefined) {
    return new Decimal(0)
  }

  return new Decimal(value)
}

export function isDecimalLike(value: string): boolean {
  try {
    decimal(value)
    return true
  } catch {
    return false
  }
}

export function moneyString(value: Decimal.Value): string {
  return decimal(value).toDecimalPlaces(2).toFixed(2)
}

export function rateString(value: Decimal.Value): string {
  return decimal(value).toDecimalPlaces(10).toString()
}

export function ratioString(value: Decimal.Value): string {
  return decimal(value).toDecimalPlaces(10).toString()
}

export function zeroMoney(): string {
  return '0.00'
}

export { Decimal }
