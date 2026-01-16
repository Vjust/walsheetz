import Table from 'cli-table3'
import chalk from 'chalk'

/**
 * Format output as JSON
 */
export function formatJson(data: any): string {
  return JSON.stringify(data, null, 2)
}

/**
 * Format wallet list as a table
 */
export function formatWalletsTable(wallets: Array<{ id: string; address: string }>): string {
  const table = new Table({
    head: [chalk.cyan('ID'), chalk.cyan('Address')],
    style: { head: [], border: [] },
  })

  for (const wallet of wallets) {
    table.push([wallet.id, wallet.address])
  }

  return table.toString()
}

/**
 * Format balance information as a table
 */
export function formatBalanceTable(
  balances: Array<{
    address: string
    sui?: string
    wal?: string
    error?: string
  }>
): string {
  const table = new Table({
    head: [chalk.cyan('Address'), chalk.cyan('SUI'), chalk.cyan('WAL')],
    style: { head: [], border: [] },
  })

  for (const balance of balances) {
    if (balance.error) {
      table.push([balance.address, chalk.red('Error'), chalk.red(balance.error)])
    } else {
      table.push([
        balance.address,
        balance.sui || '0',
        balance.wal || '0',
      ])
    }
  }

  return table.toString()
}

/**
 * Format config as a table
 */
export function formatConfigTable(config: Record<string, any>): string {
  const table = new Table({
    head: [chalk.cyan('Key'), chalk.cyan('Value')],
    style: { head: [], border: [] },
  })

  for (const [key, value] of Object.entries(config)) {
    table.push([key, value === undefined ? chalk.gray('(not set)') : String(value)])
  }

  return table.toString()
}

/**
 * Format success message
 */
export function success(message: string): string {
  return chalk.green('✓ ') + message
}

/**
 * Format error message
 */
export function error(message: string): string {
  return chalk.red('✗ ') + message
}

/**
 * Format warning message
 */
export function warning(message: string): string {
  return chalk.yellow('WARN: ') + message
}

/**
 * Format info message
 */
export function info(message: string): string {
  return chalk.blue('INFO: ') + message
}
