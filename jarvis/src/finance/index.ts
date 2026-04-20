import type { ToolDefinition } from '../actions/tools/registry.ts';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface FinanceConfig {
  plaidClientId?: string;
  plaidSecret?: string;
  plaidEnv?: 'sandbox' | 'development' | 'production';
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  name: string;
  category: string[];
  pending: boolean;
}

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  mask: string;
}

let config: FinanceConfig = {};

let transactions: Transaction[] = [];
let accounts: Account[] = [];

const FINANCE_DIR = join(homedir(), '.jarvis', 'finance');
const FINANCE_DB = join(FINANCE_DIR, 'finance.enc');

function loadFinanceData(): void {
  if (!existsSync(FINANCE_DIR)) {
    mkdirSync(FINANCE_DIR, { recursive: true });
  }
}

export function initFinance(cfg?: FinanceConfig): void {
  if (cfg) {
    config = cfg;
  }
  loadFinanceData();
}

export const plaidLinkTool: ToolDefinition = {
  name: 'finance_link',
  description: 'Link a bank account using Plaid Link for financial tracking.',
  category: 'finance',
  parameters: {
    publicToken: {
      type: 'string',
      description: 'Public token from Plaid Link',
      required: true,
    },
  },
  execute: async (params) => {
    if (!config.plaidClientId || !config.plaidSecret) {
      return 'Error: Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in config.';
    }

    const publicToken = params.publicToken as string;

    try {
      const response = await fetch('https://sandbox.plaid.com/item/public_token/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.plaidClientId,
          secret: config.plaidSecret,
          public_token: publicToken,
        }),
      });

      const data = await response.json();

      return `Bank linked successfully!
Access token: ${data.access_token.slice(0, 10)}...
Note: This is sandbox mode. Real linking requires production credentials.`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const financeAccountsTool: ToolDefinition = {
  name: 'finance_accounts',
  description: 'List linked bank accounts and their balances.',
  category: 'finance',
  parameters: {},
  execute: async () => {
    const demoAccounts: Account[] = [
      { id: '1', name: 'Checking', type: 'depository', balance: 5432.10, mask: '4242' },
      { id: '2', name: 'Savings', type: 'depository', balance: 12500.00, mask: '1234' },
      { id: '3', name: 'Credit Card', type: 'credit', balance: -450.00, mask: '5678' },
    ];

    const totalBalance = demoAccounts.reduce((sum, a) => sum + a.balance, 0);

    return `Linked Accounts:
${demoAccounts.map(a => `• ${a.name} (••${a.mask}): $${a.balance.toFixed(2)}`).join('\n')}

Total: $${totalBalance.toFixed(2)}

(Use finance_link to add real accounts)`;
  },
};

export const financeTransactionsTool: ToolDefinition = {
  name: 'finance_transactions',
  description: 'List recent transactions with optional category filtering.',
  category: 'finance',
  parameters: {
    days: {
      type: 'number',
      description: 'Number of days to look back (default: 30)',
      required: false,
    },
    category: {
      type: 'string',
      description: 'Filter by category (food, transport, shopping, etc.)',
      required: false,
    },
  },
  execute: async (params) => {
    const days = (params.days as number) || 30;
    const filterCategory = params.category as string | undefined;

    const demoTransactions: Transaction[] = [
      { id: '1', accountId: '1', amount: -45.99, date: '2026-04-18', name: 'Whole Foods', category: ['food'], pending: false },
      { id: '2', accountId: '1', amount: -12.50, date: '2026-04-17', name: 'Uber', category: ['transport'], pending: false },
      { id: '3', accountId: '1', amount: -89.00, date: '2026-04-16', name: 'Amazon', category: ['shopping'], pending: true },
      { id: '4', accountId: '1', amount: 3200.00, date: '2026-04-15', name: 'Payroll', category: ['income'], pending: false },
      { id: '5', accountId: '1', amount: -150.00, date: '2026-04-14', name: 'Netflix + Spotify', category: ['subscription'], pending: false },
    ];

    const filtered = filterCategory
      ? demoTransactions.filter(t => t.category.includes(filterCategory.toLowerCase()))
      : demoTransactions;

    return `Recent Transactions (${days} days):
${filtered.map(t => `${t.date} | ${t.name} | $${Math.abs(t.amount).toFixed(2)}${t.amount > 0 ? '+' : '-'} | ${t.category.join(', ')}${t.pending ? ' [pending]' : ''}`).join('\n')}

Total spent: $${demoTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0).toFixed(2)}`;
  },
};

export const financeAnalyzeTool: ToolDefinition = {
  name: 'finance_analyze',
  description: 'Analyze spending patterns and provide insights.',
  category: 'finance',
  parameters: {
    period: {
      type: 'string',
      description: 'Analysis period: week, month, or quarter',
      required: false,
    },
  },
  execute: async () => {
    return `Spending Analysis (Demo Data):

📊 This Month:
• Food & Dining: $342.50 (28%)
• Transport: $185.00 (15%)
• Shopping: $290.00 (24%)
• Subscriptions: $45.00 (4%)
• Entertainment: $78.00 (6%)

💡 Insights:
• Your food spending is up 15% vs last month
• Consider canceling unused subscriptions
• Transport costs could be reduced with remote work days

(Connect real accounts for actual data)`;
  },
};

export const tradeTool: ToolDefinition = {
  name: 'finance_trade',
  description: 'Execute a trade (stocks/crypto). Requires approval for amounts above threshold.',
  category: 'finance',
  parameters: {
    symbol: {
      type: 'string',
      description: 'Stock symbol or crypto (e.g., AAPL, BTC)',
      required: true,
    },
    side: {
      type: 'string',
      description: 'buy or sell',
      required: true,
    },
    quantity: {
      type: 'number',
      description: 'Number of shares/units',
      required: true,
    },
  },
  execute: async (params, context) => {
    const symbol = params.symbol as string;
    const side = params.side as string;
    const quantity = params.quantity as number;

    const prices: Record<string, number> = {
      AAPL: 175.50,
      GOOGL: 140.25,
      MSFT: 378.00,
      BTC: 67500.00,
      ETH: 3450.00,
    };

    const price = prices[symbol.toUpperCase()] || 100.00;
    const total = price * quantity;

    if (total > 50 && context?.approvalManager) {
      const approved = await context.approvalManager.requestApproval(
        `Trade: ${side.toUpperCase()} ${quantity} ${symbol}`,
        'trade',
        total
      );
      if (!approved) {
        return `⛔ Trade blocked: Requires approval for amounts > $50`;
      }
    }

    return `✅ Trade executed:
${side.toUpperCase()} ${quantity} ${symbol.toUpperCase()} @ $${price}
Total: $${total.toFixed(2)}

(Note: Demo mode - no real trade executed)`;
  },
};