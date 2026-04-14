export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  account_code?: string;
  confidence?: number;
  status: "pending" | "categorized" | "reconciled" | "review";
  reconciled_with?: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  issued: string;
  due: string;
  status: "open" | "paid";
  days_overdue: number;
  reminder_drafted?: boolean;
}

export interface Bill {
  id: string;
  vendor_id: string;
  vendor_name: string;
  amount: number;
  received: string;
  due: string;
  status: "pending_approval" | "approved" | "paid";
}

export interface Company {
  name: string;
  connected_source: string;
}

export interface Ledger {
  company: Company;
  chart_of_accounts: Array<{ code: string; name: string; type: string }>;
  customers: Array<{ id: string; name: string; email: string }>;
  vendors: Array<{ id: string; name: string }>;
  transactions: Transaction[];
  invoices: Invoice[];
  bills: Bill[];
}

export interface EmailDraft {
  id: string;
  invoice_id: string;
  to: string;
  subject: string;
  body: string;
}

export interface ToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  tool_calls: ToolCallEvent[];
  updated_ledger: Ledger;
  emails: EmailDraft[];
}
