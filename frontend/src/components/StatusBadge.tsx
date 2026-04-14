import type { Transaction } from "../lib/types";

interface Props {
  status: Transaction["status"];
}

const STYLES: Record<Transaction["status"], string> = {
  pending: "bg-neutral-800 text-neutral-400 border-neutral-700",
  categorized: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  reconciled: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  review: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const LABEL: Record<Transaction["status"], string> = {
  pending: "Pending",
  categorized: "Categorized",
  reconciled: "Reconciled",
  review: "Review",
};

export function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border font-mono ${STYLES[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
