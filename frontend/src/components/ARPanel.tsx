import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import type { Invoice } from "../lib/types";

interface Props {
  invoices: Invoice[];
  recentlyUpdated: Set<string>;
  onShowEmail: (invoiceId: string) => void;
}

function bucket(days: number): { label: string; tone: string } {
  if (days <= 0) return { label: "Current", tone: "text-neutral-400" };
  if (days <= 30) return { label: `${days}d overdue`, tone: "text-amber-400" };
  if (days <= 60) return { label: `${days}d overdue`, tone: "text-orange-400" };
  return { label: `${days}d overdue`, tone: "text-red-400" };
}

export function ARPanel({ invoices, recentlyUpdated, onShowEmail }: Props) {
  const open = invoices.filter((i) => i.status === "open");
  const total = open.reduce((s, i) => s + i.amount, 0);

  const sorted = [...open].sort((a, b) => b.days_overdue - a.days_overdue);

  return (
    <section className="border border-neutral-800 rounded-lg bg-neutral-950/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Accounts Receivable
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Open invoices by aging
          </p>
        </div>
        <div className="text-[11px] font-mono">
          <span className="text-neutral-500">Total </span>
          <span className="text-neutral-200 tabular">
            ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="max-h-[260px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-[12px]">
          <thead className="bg-neutral-900/60 sticky top-0">
            <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
              <th className="px-3 py-2 font-normal">Invoice</th>
              <th className="px-3 py-2 font-normal">Customer</th>
              <th className="px-3 py-2 font-normal text-right">Amount</th>
              <th className="px-3 py-2 font-normal">Aging</th>
              <th className="px-3 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inv) => {
              const b = bucket(inv.days_overdue);
              const isUpdated = recentlyUpdated.has(inv.id);
              return (
                <motion.tr
                  key={inv.id}
                  layout
                  className={`border-t border-neutral-900 hover:bg-neutral-900/40 ${
                    isUpdated ? "row-flash" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-neutral-300">
                    {inv.id}
                  </td>
                  <td className="px-3 py-2 text-neutral-200 max-w-[200px] truncate">
                    {inv.customer_name}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-200 font-mono tabular">
                    $
                    {inv.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className={`px-3 py-2 font-mono text-[11px] ${b.tone}`}>
                    {b.label}
                  </td>
                  <td className="px-3 py-2">
                    {inv.reminder_drafted ? (
                      <button
                        onClick={() => onShowEmail(inv.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                      >
                        <Mail className="w-3 h-3" strokeWidth={2} />
                        View draft
                      </button>
                    ) : null}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
