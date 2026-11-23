import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { CostLine, Rates } from '../types'

// European Central Bank euro reference rates. The ECB says they are "usually
// updated at around 16:00 CET every working day, except on TARGET closing days".
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
// From 15:00 UTC (16:00 CET) a weekday's rates are due.
const ECB_DUE_HOUR_UTC = 15
// While rates are due but not yet fetched, try at most hourly; the same timer
// keeps an idle session's rates current.
const RETRY_MS = 60 * 60 * 1000
const DEFAULT_CURRENCY = 'GBP'

// Every currency the ECB publishes, plus the euro itself.
const CURRENCIES = [
  'GBP', 'EUR', 'USD', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'HKD',
  'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD',
  'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR',
]

const SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: 'US$', JPY: '¥', CNY: 'CN¥', INR: '₹', KRW: '₩',
  AUD: 'A$', CAD: 'C$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', BRL: 'R$',
  MXN: 'MX$', ILS: '₪', PHP: '₱', THB: '฿', TRY: '₺', ZAR: 'R', CHF: 'CHF ',
  PLN: 'zł ',
}

const NO_DECIMALS = new Set(['JPY', 'KRW', 'IDR', 'HUF', 'ISK'])

const line = atom({ plugin: 'cost-band', key: 'line' } as const, null)
const currency = atom({ plugin: 'cost-band', key: 'currency' } as const, DEFAULT_CURRENCY)
const rates = atom({ plugin: 'cost-band', key: 'rates' } as const, null)
const ratesFailed = atom({ plugin: 'cost-band', key: 'ratesFailed' } as const, false)

type Engine = Parameters<Hook<'turn.complete'>>[0]

/** The flag emoji for a currency: the euro's is the EU flag, others the issuing country's. */
export function flagFor(code: string): string {
  const country = code === 'EUR' ? 'EU' : code.slice(0, 2)
  return [...country].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')
}

/** Reads the ECB feed; null unless it holds a date and a positive USD rate. */
export function parseEcb(xml: string): Rates | null {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1]
  const perEur: Record<string, number> = { EUR: 1 }
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const code = m[1]
    const value = Number(m[2])
    if (code && Number.isFinite(value) && value > 0) perEur[code] = value
  }
  const usd = perEur.USD
  if (!date || usd === undefined || !(usd > 0)) return null
  return { date, perEur }
}

/** The date of the newest ECB rates due by `now`: today from 15:00 UTC, else the working day before. */
export function latestEcbDate(now: number): string {
  const d = new Date(now)
  if (d.getUTCHours() < ECB_DUE_HOUR_UTC) d.setUTCDate(d.getUTCDate() - 1)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Converts US dollars to `code`; null when the rate is missing. */
export function convert(usd: number, code: string, r: Rates | null): number | null {
  if (code === 'USD') return usd
  const usdRate = r?.perEur.USD
  const target = r?.perEur[code]
  if (!usdRate || !target) return null
  return (usd / usdRate) * target
}

export function formatMoney(amount: number, code: string): string {
  const digits = NO_DECIMALS.has(code) ? 0 : 2
  const fixed = amount.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const symbol = SYMBOLS[code]
  return symbol ? `${symbol}${fixed}` : `${fixed} ${code}`
}

async function refresh($: Engine) {
  const { cost } = await $.session.usage()
  const advisor = await $.settings.read({ key: 'advisorModel' })
  const value: CostLine = {
    usd: cost?.usd ?? 0,
    unknownPrice: cost?.hasUnknownPrice === true,
    advisor: typeof advisor === 'string' && advisor !== '' ? advisor : 'off',
  }
  await update($, line, () => value)
}

async function loadRates($: Engine) {
  const saved = await $.store.get('rates')
  const cached = saved && typeof saved === 'object' ? (saved as { fetchedAt?: number; rates?: Rates }) : null
  if (cached?.rates) await update($, rates, () => cached.rates ?? null)
  const now = await $.clock.now()
  if (cached?.rates && cached.rates.date >= latestEcbDate(now)) return
  if (cached?.fetchedAt && now - cached.fetchedAt < RETRY_MS) return

  try {
    const res = await $.http.fetch(ECB_URL)
    const parsed = res.ok ? parseEcb(res.text) : null
    if (!parsed) throw new Error('unreadable ECB feed')
    await $.store.set('rates', { fetchedAt: now, rates: parsed })
    await update($, rates, () => parsed)
    await update($, ratesFailed, () => false)
  } catch {
    await update($, ratesFailed, () => true)
  }
}

async function loadCurrency($: Engine) {
  const saved = await $.store.get('currency')
  if (typeof saved === 'string' && CURRENCIES.includes(saved)) {
    await update($, currency, () => saved)
  }
}

async function chooseCurrency($: Engine, code: string) {
  if (!CURRENCIES.includes(code)) return
  await update($, currency, () => code)
  await $.store.set('currency', code)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await loadCurrency($)
    await refresh($)
    await loadRates($)
    $.clock.every(RETRY_MS, () => {
      loadRates($).catch(() => undefined)
    })
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    await loadRates($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, line)
    if (e.props.hasSurvey || current === null) {
      return next(e)
    }
    const { Box, Text, Select } = $.ui.resolve(e)
    const code = await read($, currency)
    const r = await read($, rates)
    const failed = await read($, ratesFailed)

    const converted = convert(current.usd, code, r)
    const shown = converted === null ? 'USD' : code
    const amount = formatMoney(converted ?? current.usd, shown)
    const approx = shown === 'USD' ? '' : '~'
    const notes: string[] = []
    if (current.unknownPrice) notes.push('some prices unknown')
    if (converted === null) notes.push(failed ? 'rates unavailable' : 'loading rates')
    else if (shown !== 'USD' && r) notes.push(`ECB ${r.date}`)
    const note = notes.length > 0 ? ` (${notes.join(', ')})` : ''

    return (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          Session {approx}{amount}{note} · advisor: {current.advisor}
        </Text>
        <Box flexDirection="row">
          <Select
            key="currency"
            options={CURRENCIES.map(c => ({ value: c, label: c }))}
            value={code}
            onSelect={value => chooseCurrency($, value)}
          />
          <Text> {flagFor(code)}</Text>
        </Box>
      </Box>
    )
  })
}
