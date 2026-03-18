// ─── AI Chat Interface /chat ──────────────────────────────────────────────────
// Ask questions about the fund in natural language.
// Claude has access to your CRM, pipeline, portfolio, and LP data.

import { Header } from "@/components/layout/header";
import { ChatClient } from "@/components/chat/chat-client";

export const metadata = { title: "AI Chat" };

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen">
      <Header
        title="AI Chat"
        subtitle="Ask Claude anything about your fund, portfolio, or pipeline"
      />
      <ChatClient />
    </div>
  );
}
