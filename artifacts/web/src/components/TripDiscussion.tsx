import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Trash2, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

const api = (path: string, opts?: RequestInit) =>
  fetch(path, { credentials: "include", ...opts });

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

interface Props {
  tripId: number;
}

export function TripDiscussion({ tripId }: Props) {
  const { user } = useAuth();
  const [channelId, setChannelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api(`/api/chat/channels/trip/${tripId}`)
      .then((r) => r.json())
      .then((ch) => setChannelId(ch.id))
      .catch(console.error);
  }, [tripId]);

  const fetchMessages = useCallback(() => {
    if (!channelId) return;
    api(`/api/chat/channels/${channelId}/messages`)
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(data))
      .catch(console.error);
  }, [channelId]);

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

  async function sendMessage() {
    if (!draft.trim() || !channelId || sending) return;
    setSending(true);
    try {
      const r = await api(`/api/chat/channels/${channelId}/messages`, {
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

  async function deleteMessage(id: number) {
    await api(`/api/chat/messages/${id}`, { method: "DELETE" });
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="flex flex-col bg-card border border-border rounded-lg overflow-hidden h-[420px] sm:h-[520px]">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2 flex-shrink-0">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Trip Discussion</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="w-8 h-8 opacity-20" />
            <p className="text-xs text-center">
              No messages yet.<br />Start the conversation about this trip.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isOwn = msg.userId === (user as any)?.id;
          const showAvatar = idx === 0 || messages[idx - 1].userId !== msg.userId;
          return (
            <div key={msg.id} className={`flex gap-2 group ${isOwn ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${avatarColor(msg.userId)} ${!showAvatar ? "invisible" : ""}`}>
                {initials(msg.userName)}
              </div>
              <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                {showAvatar && (
                  <div className={`flex items-baseline gap-1.5 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-[11px] font-semibold text-foreground">{msg.userName ?? "Unknown"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                )}
                <div className={`relative px-3 py-1.5 rounded-xl text-sm leading-relaxed ${
                  isOwn
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.body}
                  {isOwn && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive items-center justify-center shadow flex md:hidden md:group-hover:flex"
                      title="Delete"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-white" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 sm:px-4 py-2.5 border-t border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Add a message to this trip…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
