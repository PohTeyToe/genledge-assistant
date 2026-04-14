import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { ARPanel } from "./components/ARPanel";
import { APPanel } from "./components/APPanel";
import { ChatPanel } from "./components/ChatPanel";
import { EmailModal } from "./components/EmailModal";
import { AboutModal } from "./components/AboutModal";
import { fetchLedger, resetSession, sendChat } from "./lib/api";
import type {
  ChatMessage,
  EmailDraft,
  Ledger,
  ToolCallEvent,
} from "./lib/types";

function generateSessionId(): string {
  return `s-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export default function App() {
  const sessionIdRef = useRef<string>(generateSessionId());
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolCallEvent[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEmail, setOpenEmail] = useState<EmailDraft | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(
    new Set(),
  );
  const [mobileView, setMobileView] = useState<"ledger" | "chat">("ledger");

  const flash = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setRecentlyUpdated((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setTimeout(() => {
      setRecentlyUpdated((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }, 1600);
  }, []);

  const loadLedger = useCallback(async () => {
    try {
      const res = await fetchLedger(sessionIdRef.current);
      setLedger(res.ledger);
      setEmails((res.emails as EmailDraft[]) ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Backend unreachable: ${err.message}`
          : "Backend unreachable.",
      );
    }
  }, []);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const onSend = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || loading) return;
      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: text },
      ];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      setError(null);
      setToolEvents([]);
      if (window.innerWidth < 900) setMobileView("chat");

      try {
        const res = await sendChat(sessionIdRef.current, nextMessages);
        setLedger(res.updated_ledger);
        setEmails(res.emails);
        setToolEvents(res.tool_calls);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.message },
        ]);

        // Flash the rows the agent touched
        const updatedIds: string[] = [];
        for (const evt of res.tool_calls) {
          if (typeof evt.input?.transaction_id === "string") {
            updatedIds.push(evt.input.transaction_id as string);
          }
          if (
            typeof evt.input?.invoice_id === "string" &&
            evt.tool !== "generate_ar_reminder"
          ) {
            updatedIds.push(evt.input.invoice_id as string);
          }
          if (evt.tool === "generate_ar_reminder") {
            const id = evt.input?.invoice_id as string | undefined;
            if (id) updatedIds.push(id);
          }
          if (evt.tool === "reconcile_bank_line") {
            const matchId = evt.input?.match_id as string | undefined;
            if (matchId) updatedIds.push(matchId);
          }
        }
        flash(updatedIds);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, flash],
  );

  const onQuickPrompt = useCallback(
    (prompt: string) => {
      setInput("");
      onSend(prompt);
    },
    [onSend],
  );

  const onReset = useCallback(async () => {
    setResetting(true);
    try {
      sessionIdRef.current = generateSessionId();
      setMessages([]);
      setToolEvents([]);
      setError(null);
      setRecentlyUpdated(new Set());
      await resetSession(sessionIdRef.current);
      await loadLedger();
    } finally {
      setResetting(false);
    }
  }, [loadLedger]);

  const showEmail = useCallback(
    (invoiceId: string) => {
      // Show the most recent draft for this invoice
      const match = [...emails]
        .reverse()
        .find((e) => e.invoice_id === invoiceId);
      if (match) setOpenEmail(match);
    },
    [emails],
  );

  const company = useMemo(
    () => ({
      name: ledger?.company.name ?? "Harbor & Oak Coffee Roasters",
      source:
        ledger?.company.connected_source ?? "QuickBooks Online (sandbox)",
    }),
    [ledger],
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col">
      <TopBar
        companyName={company.name}
        source={company.source}
        onReset={onReset}
        onAbout={() => setAboutOpen(true)}
        resetting={resetting}
      />

      {/* Mobile toggle */}
      <div className="md:hidden border-b border-neutral-800 flex">
        <button
          onClick={() => setMobileView("ledger")}
          className={`flex-1 py-2 text-[12px] font-medium ${
            mobileView === "ledger"
              ? "text-neutral-100 border-b-2 border-emerald-500"
              : "text-neutral-500"
          }`}
        >
          Ledger
        </button>
        <button
          onClick={() => setMobileView("chat")}
          className={`flex-1 py-2 text-[12px] font-medium ${
            mobileView === "chat"
              ? "text-neutral-100 border-b-2 border-emerald-500"
              : "text-neutral-500"
          }`}
        >
          Copilot
        </button>
      </div>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 md:px-6 py-4 md:py-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_420px] gap-4 h-[calc(100vh-110px)]">
          <div
            className={`space-y-4 overflow-y-auto scrollbar-thin pr-1 min-h-0 ${
              mobileView === "ledger" ? "block" : "hidden md:block"
            }`}
          >
            {!ledger ? (
              <div className="border border-neutral-800 rounded-lg p-10 text-center text-neutral-500 text-sm">
                {error ?? "Loading ledger..."}
              </div>
            ) : (
              <>
                <TransactionsPanel
                  transactions={ledger.transactions}
                  recentlyUpdated={recentlyUpdated}
                />
                <ARPanel
                  invoices={ledger.invoices}
                  recentlyUpdated={recentlyUpdated}
                  onShowEmail={showEmail}
                />
                <APPanel bills={ledger.bills} />
              </>
            )}
          </div>

          <div
            className={`${
              mobileView === "chat" ? "block" : "hidden md:block"
            } min-h-0`}
          >
            <ChatPanel
              messages={messages}
              toolEvents={toolEvents}
              input={input}
              onInputChange={setInput}
              onSend={() => onSend()}
              onQuickPrompt={onQuickPrompt}
              loading={loading}
              error={error}
            />
          </div>
        </div>
      </main>

      <EmailModal email={openEmail} onClose={() => setOpenEmail(null)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
