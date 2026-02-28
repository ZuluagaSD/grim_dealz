// Currency formatting helpers

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
}

export function formatPrice(amount: number, currency: string = 'USD'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$'
  return `${symbol}${amount.toFixed(2)}`
}

export function getCurrencySymbol(currency: string = 'USD'): string {
  return CURRENCY_SYMBOLS[currency] ?? '$'
}
