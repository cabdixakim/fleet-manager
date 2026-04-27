import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Hash, Send, MessageSquare, ChevronLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { Layout } from "@/components/Layout";

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

interface Channel {
  id: number;
  name: string;
  slug: string;
  type: "team" | "trip";
  tripId: number | null;
}

interface Message {
  id: number;
  channelId: number;
  body: string;
  createdAt: string;
  userId: number;
  userName: string | null;
  userRole: string | null;
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(userId: number) {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500",
    "bg-amber-500", "bg-rose-500", "bg-cyan-500",
  ];
  return colors[userId % colors.length];
}

export default function Chat() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Mobile: "channels" shows the list, "chat" shows the message area
  const [mobileView, setMobileView] = useState<"channels" | "chat">("channels");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api("/api/chat/channels")
      .then((r) => r.json())
      .then((data: Channel[]) => {
        setChannels(data);
        // On desktop pre-select first channel; on mobile leave on channel list
        if (data.length > 0 && window.innerWidth >= 768) {
          setActiveChannel(data[0]);
        }
      })
      .catch(console.error);
  }, []);

  const fetchMessages = useCallback(() => {
    if (!activeChannel) return;
    api(`/api/chat/channels/${activeChannel.id}/messages`)
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(data))
      .catch(console.error);
  }, [activeChannel]);

  useEffect(() => {
    setMessages([]);
    fetchMessages();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setMobileView("chat");
  }

  function backToChannels() {
    setMobileView("channels");
  }

  async function sendMessage() {
    if (!draft.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const r = await api(`/api/chat/channels/${activeChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (r.ok) {
        const msg: Message = await r.json();
        setMessages((prev) => [...prev, msg]);
        setDraft("");
        inputRef.current?.focus();
      }
    } finally {
      setSending(false);
    }
  }

  const teamChannels = channels.filter((c) => c.type === "team");
  const tripChannels = channels.filter((c) => c.type === "trip");

  // ── Channel sidebar ────────────────────────────────────────────────────────
  const sidebar = (
    <aside className={`
      bg-card flex flex-col
      w-full md:w-56 md:flex-shrink-0 md:border-r md:border-border
      ${mobileView === "channels" ? "flex" : "hidden md:flex"}
    `}>
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Team Chat
        </h2>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {teamChannels.length > 0 && (
          <>
            <p className="px-2 pt-1 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Channels
            </p>
            {teamChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => selectChannel(ch)}
                className={`w-full flex items-center gap-2 px-3 py-3 md:py-1.5 rounded-md text-sm transition-colors ${
                  activeChannel?.id === ch.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 text-left">{ch.name}</span>
                <ChevronLeft className="w-3.5 h-3.5 rotate-180 md:hidden text-muted-foreground" />
              </button>
            ))}
          </>
        )}

        {tripChannels.length > 0 && (
          <>
            <p className="px-2 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Trip Threads
            </p>
            {tripChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => selectChannel(ch)}
                className={`w-full flex items-center gap-2 px-3 py-3 md:py-1.5 rounded-md text-sm transition-colors ${
                  activeChannel?.id === ch.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 truncate text-left">{ch.name}</span>
                <ChevronLeft className="w-3.5 h-3.5 rotate-180 md:hidden text-muted-foreground" />
              </button>
            ))}
          </>
        )}

        {channels.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No channels yet
          </div>
        )}
      </nav>
    </aside>
  );

  // ── Chat area ──────────────────────────────────────────────────────────────
  const chatArea = activeChannel ? (
    <div className={`
      flex-1 flex flex-col min-w-0
      ${mobileView === "chat" ? "flex" : "hidden md:flex"}
    `}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-2 flex-shrink-0">
        {/* Back button — mobile only */}
        <button
          onClick={backToChannels}
          className="md:hidden mr-1 -ml-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Back to channels"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Hash className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-foreground">{activeChannel.name}</span>
        {activeChannel.type === "trip" && activeChannel.tripId && (
          <button
            onClick={() => setLocation(`/trips/${activeChannel.tripId}`)}
            className="ml-auto text-xs text-primary hover:underline"
          >
            View Trip →
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="w-10 h-10 opacity-30" />
            <p className="text-sm">No messages yet. Be the first to say something.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isOwn = msg.userId === (user as any)?.id;
          const showAvatar = idx === 0 || messages[idx - 1].userId !== msg.userId;
          return (
            <div key={msg.id} className={`flex gap-3 group ${isOwn ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${avatarColor(msg.userId)} ${!showAvatar ? "invisible" : ""}`}>
                {initials(msg.userName)}
              </div>
              <div className={`flex flex-col max-w-[80%] md:max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
                {showAvatar && (
                  <div className={`flex items-baseline gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-semibold text-foreground">{msg.userName ?? "Unknown"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                )}
                <div className={`relative px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  isOwn
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.body}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder={`Message #${activeChannel.name.toLowerCase()}…`}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition-opacity hover:opacity-90 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  ) : (
    // Desktop empty state (no channel pre-selected)
    <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
      <div className="text-center">
        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">Select a channel to start chatting</p>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {sidebar}
        {chatArea}
      </div>
    </Layout>
  );
}
