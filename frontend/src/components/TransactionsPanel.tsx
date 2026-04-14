import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { Transaction } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  transactions: Transaction[];
  recentlyUpdated: Set<string>;
}

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "-" : ""}$${abs}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TransactionsPanel({ transactions, recentlyUpdated }: Props) {
  const total = transactions.length;
  const pending = transactions.filter((t) => t.status === "pending").length;

  return (
    <section className="border border-neutral-800 rounded-lg bg-neutral-950/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">Transactions</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Bank feed, April 2026
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-neutral-500">
            <span className="text-neutral-200 tabular">{total}</span> total
          </span>
          <span className="text-neutral-500">
            <span className="text-amber-400 tabular">{pending}</span> pending
          </span>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-[12px]">
          <thead className="bg-neutral-900/60 sticky top-0">
            <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
              <th className="px-3 py-2 font-normal">Date</th>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 font-normal text-right">Amount</th>
              <th className="px-3 py-2 font-normal">Category</th>
              <th className="px-3 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {transactions.map((t) => {
                const isUpdated = recentlyUpdated.has(t.id);
                return (
                  <motion.tr
                    key={t.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`border-t border-neutral-900 hover:bg-neutral-900/40 ${
                      isUpdated ? "row-flash" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-neutral-400 font-mono tabular whitespace-nowrap">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-3 py-2 text-neutral-200 max-w-[280px] truncate">
                      <div className="flex items-center gap-1.5">
                        {t.amount < 0 ? (
                          <ArrowUpRight
                            className="w-3 h-3 text-neutral-500 shrink-0"
                            strokeWidth={2}
                          />
                        ) : (
                          <ArrowDownLeft
                            className="w-3 h-3 text-emerald-500 shrink-0"
                            strokeWidth={2}
                          />
                        )}
                        <span className="truncate">{t.description}</span>
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular whitespace-nowrap ${
                        t.amount < 0 ? "text-neutral-200" : "text-emerald-400"
                      }`}
                    >
                      {formatAmount(t.amount)}
                    </td>
                    <td className="px-3 py-2">
                      {t.category ? (
                        <motion.span
                          initial={isUpdated ? { opacity: 0, y: -4 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px] border border-neutral-700"
                        >
                          {t.account_code && (
                            <span className="text-neutral-500 font-mono">
                              {t.account_code}
                            </span>
                          )}
                          <span>{t.category}</span>
                        </motion.span>
                      ) : (
                        <span className="text-neutral-600 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={t.status} />
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </section>
  );
}
