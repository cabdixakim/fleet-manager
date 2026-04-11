import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";

const PgSession = connectPgSimple(session);

const app: Express = express();

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const dbUrl = process.env["DATABASE_URL"];
if (!dbUrl) throw new Error("DATABASE_URL is required");

const isProd = process.env["NODE_ENV"] === "production";

app.use(session({
  store: new PgSession({
    conString: dbUrl,
    tableName: "session",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60,
  }),
  secret: process.env["SESSION_SECRET"] ?? "transportpro-secret-2026-xk9",
  resave: false,
  saveUninitialized: false,
  name: "tp.sid",
  cookie: {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    // Secure cookies require HTTPS — enable in production, disable in local dev
    secure: isProd,
    sameSite: "lax",
  },
}));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api", router);

// In production the Express server also serves the compiled React frontend so
// that all /api/* calls and the SPA share the same origin (no CORS issues).
// The frontend is built to artifacts/web/dist/public relative to the repo root.
if (isProd) {
  const frontendDist = path.join(process.cwd(), "artifacts/web/dist/public");
  app.use(express.static(frontendDist));
  // SPA fallback — any unmatched route returns index.html so client-side routing works
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
