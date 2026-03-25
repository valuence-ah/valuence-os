"use client";
// ─── Pipeline AI Chat Widget ──────────────────────────────────────────────────
// Floating "Valuence AI" button (bottom-right) that opens a slide-in chat panel.
// Uses the /api/pipeline-chat endpoint which gives Claude full pipeline context.
// API: @ai-sdk/react v3 — useChat returns { messages, sendMessage, status, setMessages }

import { Chat, useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Sparkles,
  X,
  Send,
  ChevronDown,
  Loader2,
  Bot,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Starter prompts ────────────────────────────────────────────────────────────
const STARTER_PROMPTS = [
  "Summarise the full pipeline by stage",
  "Which companies need follow-up this week?",
  "Give me a full profile on bitBiome",
  "Show LP fundraising status and gaps",
  "Who are our strategic partners and what's the co-invest potential?",
  "Flag overdue follow-ups across pipeline + LPs",
  "Draft an LP update email for our top 3 LPs",
  "What documents have been uploaded for our active deals?",
];

/** Extract plain text from a UIMessage's parts array (v3 SDK) */
function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && p.text)
    .map(p => p.text!)
    .join("");
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow">
          <Sparkles size={13} className="text-white" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-white text-slate-800 border border-slate-200 rounded-tl-sm"
        )}
      >
        {content.split("\n").map((line, i) => {
          const t = line.trim();
          if (!t) return <div key={i} className="h-1.5" />;
          if (t.startsWith("##") || t.startsWith("──")) {
            return (
              <p key={i} className={cn("font-semibold mt-2 mb-0.5 text-xs uppercase tracking-wide", isUser ? "text-blue-200" : "text-slate-500")}>
                {t.replace(/^#+\s*|──+\s*/g, "")}
              </p>
            );
          }
          if (t.startsWith("- ") || t.startsWith("• ")) {
            return (
              <p key={i} className="flex gap-1.5 mt-0.5">
                <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0", isUser ? "bg-blue-300" : "bg-blue-400")} />
                <span dangerouslySetInnerHTML={{ __html: boldify(t.slice(2)) }} />
              </p>
            );
          }
          return <p key={i} className="mt-0.5" dangerouslySetInnerHTML={{ __html: boldify(t) }} />;
        })}
      </div>
    </div>
  );
}

function boldify(t: string) {
  return t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function TypingDots() {
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow">
        <Sparkles size={13} className="text-white" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400"
              style={{ animation: `vaBounce 1.2s infinite ${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────────
export function PipelineChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // v3 API: requires a Chat instance; sendMessage({ text }), status string
  // `api` is a valid runtime option but missing from ChatInit types — cast required
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chat = useMemo(() => new Chat({ api: "/api/pipeline-chat" } as any), []);
  const { messages, sendMessage, status, setMessages } = useChat({ chat });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, isLoading]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      send(text);
    }
  }

  function send(msg: string) {
    const trimmed = msg.trim();
    if (!trimmed || isLoading) return;
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    sendMessage({ text: trimmed });
  }

  return (
    <>
      <style>{`
        @keyframes vaBounce {
          0%,60%,100% { transform:translateY(0);opacity:.5; }
          30% { transform:translateY(-5px);opacity:1; }
        }
        @keyframes vaSlideIn {
          from { opacity:0;transform:translateY(14px) scale(.97); }
          to   { opacity:1;transform:translateY(0)   scale(1); }
        }
        .va-panel { animation:vaSlideIn .2s ease-out; }
      `}</style>

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Valuence AI Assistant"
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl shadow-xl",
          "flex items-center justify-center transition-all duration-200",
          "bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700",
          "hover:scale-105 active:scale-95",
          open && "rotate-180 from-slate-700 to-slate-800 hover:from-slate-700 hover:to-slate-800"
        )}
      >
        {open ? <X size={22} className="text-white" /> : <Sparkles size={22} className="text-white" />}
        {!open && <span className="absolute inset-0 rounded-2xl animate-ping opacity-20 bg-blue-500" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="va-panel fixed bottom-24 right-6 z-50 w-[390px] max-w-[calc(100vw-1.5rem)]"
          style={{
            height: "clamp(400px,70vh,580px)",
            display: "flex",
            flexDirection: "column",
            borderRadius: "1.25rem",
            boxShadow: "0 24px 64px rgba(0,0,0,.18),0 4px 16px rgba(0,0,0,.12)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-tight">Valuence AI Assistant</p>
              <p className="text-blue-200 text-xs">Pipeline · LPs · Strategics · Documents</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  title="Clear conversation"
                  className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/15 transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4 space-y-3"
            style={{ scrollbarWidth: "thin" }}
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center pt-4 pb-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 shadow-lg">
                  <Bot size={24} className="text-white" />
                </div>
                <p className="text-slate-800 font-semibold text-sm">Ask me anything about</p>
                <p className="text-slate-500 text-xs mt-0.5 mb-5">pipeline, LPs, strategic partners, documents, or market intel</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="text-xs bg-white border border-slate-200 text-slate-700 rounded-full px-3 py-1.5 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(m => (
              <MessageBubble key={m.id} role={m.role} content={extractText(m.parts)} />
            ))}

            {isLoading && (messages.at(-1)?.role === "user" || messages.length === 0) && <TypingDots />}
            <div ref={bottomRef} />
          </div>

          {/* Scroll-to-bottom */}
          {showScrollBtn && (
            <button
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute bottom-20 right-5 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors z-10"
            >
              <ChevronDown size={16} />
            </button>
          )}

          {/* Input */}
          <div className="flex-shrink-0 bg-white border-t border-slate-200 px-3 py-2.5">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-blue-400 focus-within:bg-white transition-colors">
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask about pipeline, LPs, strategics, or companies…"
                disabled={isLoading}
                className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none leading-relaxed disabled:opacity-60"
                style={{ minHeight: "24px", maxHeight: "120px" }}
              />
              <button
                onClick={() => send(text)}
                disabled={!text.trim() || isLoading}
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  text.trim() && !isLoading
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                {isLoading
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Send size={15} />
                }
              </button>
            </div>
            <p className="text-center text-slate-400 text-[10px] mt-1.5">
              Powered by Claude · live pipeline data
            </p>
          </div>
        </div>
      )}
    </>
  );
}
