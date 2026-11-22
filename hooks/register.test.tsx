import { expect, test } from 'claude-code/testing'

import { convert, flagFor, formatMoney, parseEcb } from './register'

const BAND = {
  plugin: 'cost-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

const ECB_XML = `<?xml version="1.0"?><gesmes:Envelope><Cube><Cube time='2026-11-20'>
<Cube currency='USD' rate='1.1000'/><Cube currency='GBP' rate='0.84'/>
<Cube currency='JPY' rate='174.35'/><Cube currency='IDR' rate='20071.37'/>
</Cube></Cube></gesmes:Envelope>`

type Setup = { usd?: number; feed?: string; ok?: boolean; store?: Record<string, unknown> }

function engine(on: any, { usd = 1.1, feed = ECB_XML, ok = true, store = {} }: Setup) {
  const calls = { fetch: 0 }
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd } } }))
  on('settings.read', () => ({ value: { advisorModel: 'fable' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('store.get', (_: unknown, e: any) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('http.fetch', () => {
    calls.fetch += 1
    return { value: { status: ok ? 200 : 500, ok, headers: {}, text: feed } }
  })
  return { calls, store }
}

async function start($: any) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

async function rowText(ui: any) {
  return (await ui.find({ type: 'Text', text: /Session/ }))?.text
}

test('defaults to pounds with the UK flag, on every surface', async ($, on) => {
  engine(on, {})
  await start($)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await rowText(ui)).toBe('Session ~£0.84 (ECB 2026-11-20) · advisor: fable')
    expect((await ui.find({ type: 'Text', text: /🇬🇧/ }))?.text).toBe(' 🇬🇧')
    await ui.unmount()
  }
})

test('picking a currency converts, changes the flag and is remembered', async ($, on) => {
  const { store } = engine(on, {})
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: 'currency', value: 'JPY' })
  expect(await rowText(ui)).toBe('Session ~¥174 (ECB 2026-11-20) · advisor: fable')
  expect((await ui.find({ type: 'Text', text: /🇯🇵/ }))?.text).toBe(' 🇯🇵')
  expect(store.currency).toBe('JPY')
  await ui.unmount()
})

test('a saved currency is used next session', async ($, on) => {
  engine(on, { store: { currency: 'USD' } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await rowText(ui)).toBe('Session US$1.10 · advisor: fable')
  expect((await ui.find({ type: 'Text', text: /🇺🇸/ }))?.text).toBe(' 🇺🇸')
  await ui.unmount()
})

test('bad input: an unreadable rate feed falls back to US dollars', async ($, on) => {
  engine(on, { feed: '<html>Service unavailable</html>', ok: true })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await rowText(ui)).toBe('Session US$1.10 (rates unavailable) · advisor: fable')
  await ui.unmount()
})

test('bad input: a failed request falls back to US dollars', async ($, on) => {
  engine(on, { ok: false })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await rowText(ui)).toBe('Session US$1.10 (rates unavailable) · advisor: fable')
  await ui.unmount()
})

test('rates fetched in the last 12 hours are reused, not fetched again', async ($, on) => {
  const rates = parseEcb(ECB_XML)
  const { calls } = engine(on, { store: { rates: { fetchedAt: 1_000_000 - 60_000, rates } } })
  await start($)
  expect(calls.fetch).toBe(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await rowText(ui)).toBe('Session ~£0.84 (ECB 2026-11-20) · advisor: fable')
  await ui.unmount()
})

test('gives way to a survey', async ($, on) => {
  engine(on, {})
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  await ui.unmount()
})

test('helpers: flags, formatting, parsing and missing rates', async () => {
  expect(flagFor('GBP')).toBe('🇬🇧')
  expect(flagFor('EUR')).toBe('🇪🇺')
  expect(flagFor('ZAR')).toBe('🇿🇦')
  expect(formatMoney(20071.37, 'IDR')).toBe('20,071 IDR')
  expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50')
  expect(parseEcb('no rates here')).toBe(null)
  expect(parseEcb("<Cube time='2026-11-20'><Cube currency='GBP' rate='0.84'/>")).toBe(null)
  expect(convert(1, 'SEK', parseEcb(ECB_XML))).toBe(null)
  expect(convert(2.5, 'USD', null)).toBe(2.5)
})
