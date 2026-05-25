export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return new Date(dateStr + 'T00:00:00') < new Date(new Date().toDateString())
}

export function isDueSoon(dateStr: string | null | undefined, days = 7): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date(new Date().toDateString())
  const limit = new Date(now)
  limit.setDate(limit.getDate() + days)
  return d >= now && d <= limit
}
