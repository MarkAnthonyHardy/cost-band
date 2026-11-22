export type CostLine = { usd: number; unknownPrice: boolean; advisor: string }

/** ECB euro reference rates: units of each currency per 1 EUR, and the ECB's date. */
export type Rates = { date: string; perEur: Record<string, number> }

declare module 'claude-code' {
  interface PluginState {
    'cost-band': {
      line: CostLine | null
      currency: string
      rates: Rates | null
      ratesFailed: boolean
    }
  }
}
