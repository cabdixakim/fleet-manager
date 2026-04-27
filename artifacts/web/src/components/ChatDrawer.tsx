import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X, Hash, Send, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

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
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  return colors[userId % colors.length];
}

export function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Open via event (from sidebar link or header button)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  }, []);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load channels when drawer opens
  useEffect(() => {
    if (!open) return;
    api("/api/chat/channels")
      .then((r) => r.json())
      .then((data: Channel[]) => {
        setChannels(data);
        if (!activeChannel && data.length > 0) setActiveChannel(data[0]);
      })
      .catch(console.error);
  }, [open]);

  // Poll messages for active channel
  const fetchMessages = useCallback(() => {
    if (!activeChannel || !open) return;
    api(`/api/chat/channels/${activeChannel.id}/messages`)
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(data))
      .catch(console.error);
  }, [activeChannel, open]);

  useEffect(() => {
    setMessages([]);
    if (!open || !activeChannel) return;
    fetchMessages();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages, open]);

  // Scroll to bottom when messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setTimeout(() => inputRef.current?.focus(), 50);
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
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } finally {
      setSending(false);
    }
  }

  const teamChannels = channels.filter((c) => c.type === "team");
  const tripChannels = channels.filter((c) => c.type === "trip");

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Drawer — wider to fit split pane */}
      <div className="fixed right-0 top-0 z-[70] flex flex-col bg-card shadow-2xl border-l border-border
                      w-full h-[100dvh]
                      sm:w-[520px]">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border bg-card flex-shrink-0">
          <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="flex-1 font-semibold text-foreground">
            {activeChannel ? `# ${activeChannel.name}` : "Team Chat"}
          </span>
          {activeChannel?.type === "trip" && activeChannel.tripId && (
            <button
              onClick={() => { setOpen(false); setLocation(`/trips/${activeChannel.tripId}`); }}
              className="text-xs text-primary hover:underline mr-2"
            >
              View Trip →
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Split pane: channel list + messages ─────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Left: channel list ─────────────────────────────────── */}
          <aside className="w-[120px] flex-shrink-0 border-r border-border flex flex-col bg-card/50 overflow-y-auto">
            {teamChannels.length > 0 && (
              <div className="py-2">
                <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Channels
                </p>
                {teamChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch)}
                    className={`w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors ${
                      activeChannel?.id === ch.id
                        ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Hash className="w-3 h-3 flex-shrink-0" />
                    <span className="text-xs truncate">{ch.name}</span>
                  </button>
                ))}
              </div>
            )}

            {tripChannels.length > 0 && (
              <div className="py-2 border-t border-border">
                <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Trips
                </p>
                {tripChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch)}
                    className={`w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors ${
                      activeChannel?.id === ch.id
                        ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Hash className="w-3 h-3 flex-shrink-0" />
                    <span className="text-xs truncate">{ch.name.replace("Trip: ", "")}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* ── Right: messages + input ─────────────────────────────── */}
          {activeChannel ? (
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
                    <MessageSquare className="w-8 h-8 opacity-20" />
                    <p className="text-xs text-center">No messages yet.<br />Say something!</p>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isOwn = msg.userId === (user as any)?.id;
                  const showMeta = idx === 0 || messages[idx - 1].userId !== msg.userId;
                  return (
                    <div key={msg.id} className={`flex gap-2 group ${isOwn ? "flex-row-reverse" : ""}`}>
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${avatarColor(msg.userId)} ${!showMeta ? "invisible" : ""}`}>
                        {initials(msg.userName)}
                      </div>
                      <div className={`flex flex-col max-w-[80%] ${isOwn ? "items-end" : "items-start"}`}>
                        {showMeta && (
                          <div className={`flex items-baseline gap-1.5 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                            <span className="text-[11px] font-semibold text-foreground">{msg.userName ?? "Unknown"}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        <div className={`relative px-3 py-2 rounded-2xl text-sm leading-relaxed ${
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

              {/* Input — safe-area inset for notched phones */}
              <div className="flex-shrink-0 px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom,12px))] border-t border-border bg-card">
                <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                    }}
                    placeholder={`Message #${activeChannel.name.toLowerCase()}…`}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!draft.trim() || sending}
                    className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Select a channel</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
