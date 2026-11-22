export type CostLine = { usd: number; unknownPrice: boolean; advisor: string }

declare module 'claude-code' {
  interface PluginState {
    'cost-band': { line: CostLine | null }
  }
}
