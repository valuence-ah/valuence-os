"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, FileText, Bot, User } from "lucide-react";
import type { PortfolioInvestment } from "@/lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  companyId: string;
  companyName: string;
  investments: PortfolioInvestment[];
}

const STARTER_QUESTIONS = [
  "What are the key terms of our investment?",
  "What is our valuation cap and discount rate?",
  "Summarise the investment documents",
  "What board rights do we have?",
  "What is the price per share?",
];

// ── Simple streaming fetch helper ─────────────────────────────────────────────
// Reads the AI SDK data-stream protocol (lines starting with `0:"..."`)
// and calls onChunk with each text delta.
async function streamAIResponse(
  url: string,
  body: object,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      // Data stream protocol: `0:"text chunk"`
      if (line.startsWith('0:')) {
        try {
          const text: string = JSON.parse(line.slice(2));
          onChunk(text);
        } catch {
          // malformed chunk — skip
        }
      }
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export function PortfolioAssistantTab({ companyId, companyName, investments }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const docCount = investments.reduce((n, inv) => {
    return n + (inv.memo_storage_path ? 1 : 0) + (inv.subscription_doc_storage_path ? 1 : 0);
  }, 0);

  const hasDocs = docCount > 0;

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(null);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Build messages history for the API (exclude the empty assistant placeholder)
    const historyForApi = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      await streamAIResponse(
        "/api/portfolio/assistant",
        { messages: historyForApi, companyId },
        (chunk) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m
            )
          );
        },
        controller.signal
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errMsg);
      setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, isLoading, companyId]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    sendMessage(input.trim());
  }

  function handleStarterClick(q: string) {
    if (isLoading) return;
    sendMessage(q);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Context bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-violet-50 to-blue-50 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-violet-500" />
          <span className="text-[11px] font-semibold text-violet-700">Valuence AI</span>
        </div>
        <span className="text-slate-300 text-xs">·</span>
        <span className="text-[11px] text-slate-500">{companyName}</span>
        <span className="text-slate-300 text-xs">·</span>
        <div className="flex items-center gap-1">
          <FileText size={11} className={hasDocs ? "text-blue-500" : "text-slate-300"} />
          <span className={`text-[11px] ${hasDocs ? "text-blue-600" : "text-slate-400"}`}>
            {hasDocs
              ? `${docCount} document${docCount > 1 ? "s" : ""} loaded`
              : "No documents uploaded"}
          </span>
        </div>
        {investments.length > 0 && (
          <>
            <span className="text-slate-300 text-xs">·</span>
            <span className="text-[11px] text-slate-500">
              {investments.length} investment{investments.length > 1 ? "s" : ""}
            </span>
          </>
        )}
        {isLoading && (
          <div className="ml-auto">
            <button
              onClick={() => abortRef.current?.abort()}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center mb-3">
              <Sparkles size={22} className="text-violet-500" />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-1">
              Ask about your {companyName} investment
            </p>
            <p className="text-xs text-slate-400 mb-5 max-w-[280px]">
              {hasDocs
                ? `I have ${docCount} document${docCount > 1 ? "s" : ""} and your investment data loaded. Ask me anything about the terms, structure, or documents.`
                : "I have your investment data. Upload memos or subscription docs in the Valuence Investment tab for richer answers."}
            </p>

            {/* Starter chips */}
            <div className="flex flex-col gap-2 w-full max-w-[340px]">
              {STARTER_QUESTIONS.filter(q => {
                if (q.includes("price per share")) return investments.some(i => i.investment_type !== "safe");
                if (q.includes("valuation cap")) return investments.some(i => i.investment_type === "safe");
                return true;
              }).slice(0, 4).map(q => (
                <button
                  key={q}
                  onClick={() => handleStarterClick(q)}
                  className="w-full text-left text-[12px] text-slate-600 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 px-3 py-2 rounded-lg transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === "user"
                ? "bg-slate-200"
                : "bg-gradient-to-br from-violet-500 to-blue-500"
            }`}>
              {msg.role === "user"
                ? <User size={12} className="text-slate-500" />
                : <Bot size={12} className="text-white" />
              }
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-slate-100 text-slate-800 rounded-tl-sm"
              }`}
            >
              {msg.content || (
                msg.role === "assistant" && isLoading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin text-slate-400" />
                    <span className="text-slate-400 text-xs">
                      {hasDocs ? "Analysing documents…" : "Thinking…"}
                    </span>
                  </span>
                ) : null
              )}
            </div>
          </div>
        ))}

        {/* Error banner */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error} — please try again.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input form */}
      <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 bg-white">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask about investment terms, documents, or structure…"
            disabled={isLoading}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 disabled:opacity-50 disabled:bg-slate-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send size={14} className="text-white" />
          </button>
        </form>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">
          AI can make mistakes — always verify important terms in the original documents.
        </p>
      </div>
    </div>
  );
}
