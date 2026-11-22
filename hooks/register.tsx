import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { CostLine } from '../types'

// Fixed estimate set 22 Nov 2026, not a live rate. Edit to update.
const USD_PER_GBP = 1.28

const line = atom({ plugin: 'cost-band', key: 'line' } as const, null)

type Engine = Parameters<Hook<'turn.complete'>>[0]

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, line)
    if (e.props.hasSurvey || current === null) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const gbp = current.usd / USD_PER_GBP
    const note = current.unknownPrice ? ' (some prices unknown)' : ''
    return (
      <Box>
        <Text dimColor>
          Session ~£{gbp.toFixed(2)}{note} · advisor: {current.advisor}
        </Text>
      </Box>
    )
  })
}
