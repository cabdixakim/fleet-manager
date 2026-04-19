import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X, Hash, Send, Trash2, MessageSquare, ChevronLeft } from "lucide-react";
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
  const colors = ["bg-blue-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-cyan-500"];
  return colors[userId % colors.length];
}

export function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  // Channel state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  // Mobile: show channel list or chat view
  const [mobileView, setMobileView] = useState<"channels" | "chat">("channels");

  // Message state
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for open-chat event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  }, []);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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

  // Poll messages
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

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setMobileView("chat");
    inputRef.current?.focus();
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

  async function deleteMessage(id: number) {
    await api(`/api/chat/messages/${id}`, { method: "DELETE" });
    setMessages((prev) => prev.filter((m) => m.id !== id));
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

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-[70] flex flex-col bg-card shadow-2xl
                      w-full h-full
                      md:w-[380px] md:border-l md:border-border">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border bg-card flex-shrink-0">
          {/* Mobile back to channels */}
          {mobileView === "chat" && (
            <button
              onClick={() => setMobileView("channels")}
              className="md:hidden -ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />

          {mobileView === "chat" && activeChannel ? (
            <span className="flex-1 font-semibold text-foreground truncate">
              # {activeChannel.name}
            </span>
          ) : (
            <span className="flex-1 font-semibold text-foreground">Team Chat</span>
          )}

          {/* Trip link — mobile chat view only */}
          {mobileView === "chat" && activeChannel?.type === "trip" && activeChannel.tripId && (
            <button
              onClick={() => { setOpen(false); setLocation(`/trips/${activeChannel.tripId}`); }}
              className="text-xs text-primary hover:underline mr-1"
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

        {/* ── Desktop: channel tabs ───────────────────────────── */}
        <div className="hidden md:flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/20 overflow-x-auto flex-shrink-0 scrollbar-none">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeChannel?.id === ch.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Hash className="w-3 h-3" />
              {ch.name}
            </button>
          ))}
        </div>

        {/* ── Mobile: channel list view ────────────────────────── */}
        {mobileView === "channels" && (
          <div className="md:hidden flex-1 overflow-y-auto py-2 px-2">
            {teamChannels.length > 0 && (
              <>
                <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Channels
                </p>
                {teamChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch)}
                    className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-lg transition-colors mb-0.5 ${
                      activeChannel?.id === ch.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Hash className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{ch.name}</p>
                      <p className="text-xs text-muted-foreground">Team channel</p>
                    </div>
                    <ChevronLeft className="w-4 h-4 rotate-180 text-muted-foreground" />
                  </button>
                ))}
              </>
            )}
            {tripChannels.length > 0 && (
              <>
                <p className="px-3 pt-3 pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Trip Threads
                </p>
                {tripChannels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch)}
                    className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-lg transition-colors mb-0.5 ${
                      activeChannel?.id === ch.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <Hash className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{ch.name}</p>
                      <p className="text-xs text-muted-foreground">Trip discussion</p>
                    </div>
                    <ChevronLeft className="w-4 h-4 rotate-180 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Messages area — desktop always, mobile only in chat view ── */}
        {(mobileView === "chat" || true) && activeChannel && (
          <div className={`flex-1 flex flex-col min-h-0 ${mobileView === "channels" ? "hidden md:flex" : "flex"}`}>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No messages yet.</p>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isOwn = msg.userId === (user as any)?.id;
                const showMeta = idx === 0 || messages[idx - 1].userId !== msg.userId;
                return (
                  <div key={msg.id} className={`flex gap-2.5 group ${isOwn ? "flex-row-reverse" : ""}`}>
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
                        {isOwn && (
                          <button
                            onClick={() => deleteMessage(msg.id)}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive flex items-center justify-center shadow opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
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

            {/* ── Input bar ─────────────────────────────────────── */}
            {/* pb accounts for mobile bottom nav (64px) + some padding */}
            <div
              className="flex-shrink-0 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+68px)] md:pb-3 border-t border-border bg-card"
            >
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
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                <button
                  onClick={sendMessage}
                  disabled={!draft.trim() || sending}
                  className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state when no channel selected on desktop */}
        {!activeChannel && (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Select a channel above</p>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
