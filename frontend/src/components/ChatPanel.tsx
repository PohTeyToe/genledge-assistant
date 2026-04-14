import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CornerDownLeft, Sparkles, Wrench } from "lucide-react";
import type { ChatMessage, ToolCallEvent } from "../lib/types";

interface Props {
  messages: ChatMessage[];
  toolEvents: ToolCallEvent[];
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onQuickPrompt: (prompt: string) => void;
  loading: boolean;
  error: string | null;
}

const SUGGESTIONS = [
  "Categorize my uncategorized transactions",
  "Reconcile this week's bank activity",
  "Draft reminder emails for invoices over 30 days",
  "What's my AR aging look like?",
];

const TOOL_LABEL: Record<string, string> = {
  categorize_transaction: "Categorize",
  reconcile_bank_line: "Reconcile",
  generate_ar_reminder: "Draft reminder",
};

export function ChatPanel({
  messages,
  toolEvents,
  input,
  onInputChange,
  onSend,
  onQuickPrompt,
  loading,
  error,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, toolEvents.length]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && input.trim()) onSend();
    }
  };

  return (
    <section className="border border-neutral-800 rounded-lg bg-neutral-950/60 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-neutral-100">Copilot</h2>
        <span className="text-[11px] font-mono text-neutral-500 ml-auto">
          Haiku 4.5
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3 min-h-0"
      >
        {messages.length === 0 && (
          <div className="text-[12px] text-neutral-500 leading-relaxed">
            Hi. I can read your ledger and run three actions: categorize
            transactions, reconcile bank lines, and draft AR reminder emails.
            Try one of the prompts below.
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={m.role === "user" ? "flex justify-end" : "flex"}
          >
            <div
              className={
                m.role === "user"
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-neutral-100 text-[12.5px] leading-relaxed rounded-lg px-3 py-2 max-w-[85%]"
                  : "text-neutral-200 text-[12.5px] leading-relaxed max-w-[95%] whitespace-pre-wrap"
              }
            >
              {m.content}
            </div>
          </motion.div>
        ))}

        {toolEvents.length > 0 && loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-1"
          >
            {toolEvents.slice(-4).map((evt, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] font-mono text-neutral-500"
              >
                <Wrench className="w-3 h-3 text-emerald-500" strokeWidth={2} />
                <span className="text-emerald-400">
                  {TOOL_LABEL[evt.tool] ?? evt.tool}
                </span>
                <span className="text-neutral-600">
                  {(evt.input.transaction_id ||
                    evt.input.invoice_id ||
                    "") as string}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono">
            <div className="flex gap-0.5">
              <span className="w-1 h-1 bg-neutral-500 rounded-full animate-pulse" />
              <span
                className="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
            thinking
          </div>
        )}

        {error && (
          <div className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
            {error}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 space-y-2 border-t border-neutral-800 pt-3 shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((p) => (
            <button
              key={p}
              onClick={() => onQuickPrompt(p)}
              disabled={loading}
              className="text-[11px] text-neutral-400 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full px-2.5 py-1 transition disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your ledger..."
            rows={2}
            disabled={loading}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-3 pr-10 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-700 disabled:opacity-60"
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="absolute right-2 bottom-2 p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 disabled:opacity-30 transition"
            title="Send (Enter)"
          >
            <CornerDownLeft className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
}
