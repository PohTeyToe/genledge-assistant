import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 grid place-items-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-lg shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">
                About Ledger Copilot
              </h2>
              <button
                onClick={onClose}
                className="text-neutral-500 hover:text-neutral-100 p-1"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-[12.5px] text-neutral-300 leading-relaxed">
              <p>
                This is a one-day prototype built for GenLedge by Abdallah Safi.
                Not a production system. Nothing persists after the session
                resets.
              </p>
              <p>
                The left pane renders a fake QuickBooks Online feed for a small
                coffee roaster. The right pane is a Claude Haiku 4.5 agent that
                can call three tools against the ledger: categorize a
                transaction, reconcile a bank line, and draft an AR reminder.
              </p>
              <p>
                Stack: React 19 plus Tailwind v4 plus Framer Motion on Vercel,
                FastAPI plus the Anthropic Python SDK on Render, with prompt
                caching on the system prompt so per-turn cost stays near zero.
              </p>
              <p className="text-neutral-500">
                Code and writeup:{" "}
                <a
                  className="text-emerald-400 hover:underline"
                  href="https://github.com/PohTeyToe/genledge-assistant"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/PohTeyToe/genledge-assistant
                </a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
