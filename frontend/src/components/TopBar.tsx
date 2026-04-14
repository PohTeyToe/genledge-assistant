import { CheckCircle2, Info, RotateCcw } from "lucide-react";

interface Props {
  companyName: string;
  source: string;
  onReset: () => void;
  onAbout: () => void;
  resetting: boolean;
}

export function TopBar({ companyName, source, onReset, onAbout, resetting }: Props) {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/40 grid place-items-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-neutral-100 tracking-tight">
            Ledger Copilot
          </span>
          <span className="text-[11px] uppercase tracking-widest text-neutral-500 font-mono ml-1">
            Prototype
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 pl-4 ml-2 border-l border-neutral-800">
          <span className="text-[13px] text-neutral-300">{companyName}</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
            <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
            {source}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onAbout}
            className="flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 px-2.5 py-1.5 rounded hover:bg-neutral-900 transition"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.75} />
            About this demo
          </button>
          <button
            onClick={onReset}
            disabled={resetting}
            className="flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 px-2.5 py-1.5 rounded hover:bg-neutral-900 transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
            {resetting ? "Resetting..." : "Reset ledger"}
          </button>
        </div>
      </div>
    </header>
  );
}
