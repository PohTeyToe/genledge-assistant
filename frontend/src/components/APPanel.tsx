import type { Bill } from "../lib/types";

interface Props {
  bills: Bill[];
}

const STATUS_STYLE: Record<Bill["status"], string> = {
  pending_approval: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  approved: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  paid: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};
const STATUS_LABEL: Record<Bill["status"], string> = {
  pending_approval: "Pending",
  approved: "Approved",
  paid: "Paid",
};

export function APPanel({ bills }: Props) {
  const pending = bills.filter((b) => b.status === "pending_approval");
  const total = pending.reduce((s, b) => s + b.amount, 0);

  return (
    <section className="border border-neutral-800 rounded-lg bg-neutral-950/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            Accounts Payable
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Bills awaiting approval
          </p>
        </div>
        <div className="text-[11px] font-mono">
          <span className="text-neutral-500">Pending </span>
          <span className="text-neutral-200 tabular">
            ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-[12px]">
          <thead className="bg-neutral-900/60 sticky top-0">
            <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
              <th className="px-3 py-2 font-normal">Bill</th>
              <th className="px-3 py-2 font-normal">Vendor</th>
              <th className="px-3 py-2 font-normal">Due</th>
              <th className="px-3 py-2 font-normal text-right">Amount</th>
              <th className="px-3 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr
                key={b.id}
                className="border-t border-neutral-900 hover:bg-neutral-900/40"
              >
                <td className="px-3 py-2 font-mono text-neutral-300">{b.id}</td>
                <td className="px-3 py-2 text-neutral-200 max-w-[180px] truncate">
                  {b.vendor_name}
                </td>
                <td className="px-3 py-2 text-neutral-400 font-mono tabular">
                  {new Date(b.due).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-3 py-2 text-right text-neutral-200 font-mono tabular">
                  $
                  {b.amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border font-mono ${STATUS_STYLE[b.status]}`}
                  >
                    {STATUS_LABEL[b.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
