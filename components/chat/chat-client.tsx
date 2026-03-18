"use client";
// ─── AI Chat Client ────────────────────────────────────────────────────────────
// Full-featured chat interface powered by Claude.
// Streams responses in real-time. Uses Vercel AI SDK useChat hook.
// Suggested prompts to help users get started.

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, RefreshCw, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "What does our active deal pipeline look like?",
  "Which portfolio companies haven't reported KPIs this month?",
  "Summarize our top 3 LP relationships by commitment stage",
  "What sectors are most represented in our pipeline?",
  "Which deals have been in 'Deep Dive' for more than 30 days?",
  "Give me a brief on any startups in our CRM working on carbon capture",
];

export function ChatClient() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { messages, append, isLoading, reload, error } = useChat({
    api: "/api/chat",
    initialMessages: [],
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSuggestedPrompt(prompt: string) {
    setInput(prompt);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await append({ role: "user", content: text });
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6">

        {showWelcome ? (
          /* Welcome screen */
          <div className="max-w-2xl mx-auto pt-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="text-white" size={24} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Valuence AI Assistant</h2>
              <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
                Ask me anything about your fund — pipeline status, portfolio companies, LP relationships, sourcing signals, or market trends.
              </p>
            </div>

            {/* Suggested prompts */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={14} className="text-slate-400" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Try asking</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="text-left px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-300 hover:shadow-sm text-sm text-slate-700 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message thread */
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("msg-enter flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white flex-shrink-0 mr-3 mt-0.5">
                    <Sparkles size={14} />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-800 rounded-bl-sm"
                  )}
                >
                  {/* Preserve line breaks and basic markdown */}
                  <div className="whitespace-pre-wrap">
                    {msg.parts
                      ? msg.parts.map((p: { type: string; text?: string }, i: number) => p.type === "text" ? <span key={i}>{p.text}</span> : null)
                      : (msg as { content?: string }).content}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-center gap-3 msg-enter">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <div className="thinking-dot" />
                    <div className="thinking-dot" />
                    <div className="thinking-dot" />
                  </div>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <span>Something went wrong. Please try again.</span>
                <button onClick={() => reload()} className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium">
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white px-6 py-4">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex gap-3 items-end"
        >
          <textarea
            className="flex-1 px-4 py-3 text-sm border border-slate-300 rounded-2xl bg-white text-slate-900 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       resize-none max-h-32 min-h-[48px]"
            placeholder="Ask anything about your fund…"
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center text-white transition-colors flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-2">
          Press Enter to send · Shift+Enter for new line · Powered by Claude
        </p>
      </div>
    </div>
  );
}
