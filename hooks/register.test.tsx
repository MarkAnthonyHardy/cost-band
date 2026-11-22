import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'cost-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 3 },
  },
} as const

function engine(on: any, usage: unknown, settings: unknown) {
  on('session.usage', () => ({ value: usage }))
  on('settings.read', () => ({ value: settings }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
}

test('shows cost in £ with the advisor, on every surface', async ($, on) => {
  engine(on, { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 1.28 } }, { advisorModel: 'fable' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Text', text: /Session/ })
    expect(row?.text).toBe('Session ~£1.00 · advisor: fable')
    await ui.unmount()
  }
})

test('bad input: no cost and no advisor setting still draws', async ($, on) => {
  engine(on, { startedAt: 0, context: {}, rateLimits: [] }, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /Session/ })
  expect(row?.text).toBe('Session ~£0.00 · advisor: off')
  await ui.unmount()
})

test('unknown model price is flagged', async ($, on) => {
  engine(on, { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 2.56, hasUnknownPrice: true } }, { advisorModel: 'opus' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /Session/ })
  expect(row?.text).toBe('Session ~£2.00 (some prices unknown) · advisor: opus')
  await ui.unmount()
})

test('gives way to a survey', async ($, on) => {
  engine(on, { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 1 } }, { advisorModel: 'fable' })
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, hasSurvey: true } })
  expect((await ui.find({ type: 'Text', text: /Session/ }))).toBeUndefined()
  await ui.unmount()
})
