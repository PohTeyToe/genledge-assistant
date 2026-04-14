import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { EmailDraft } from "../lib/types";

interface Props {
  email: EmailDraft | null;
  onClose: () => void;
}

export function EmailModal({ email, onClose }: Props) {
  return (
    <AnimatePresence>
      {email && (
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
            className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-lg shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">
                  AR reminder draft
                </h2>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                  Invoice {email.invoice_id} to {email.to}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-neutral-500 hover:text-neutral-100 p-1"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-1">
                  Subject
                </div>
                <div className="text-[13px] text-neutral-100">
                  {email.subject}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-1">
                  Body
                </div>
                <pre className="text-[12.5px] text-neutral-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {email.body}
                </pre>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="text-[12px] text-neutral-400 hover:text-neutral-100 px-3 py-1.5 rounded"
              >
                Close
              </button>
              <button
                disabled
                title="Cosmetic only, this is a demo"
                className="text-[12px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded opacity-70 cursor-not-allowed"
              >
                Send (cosmetic)
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
