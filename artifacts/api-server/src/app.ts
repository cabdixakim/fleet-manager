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
    secure: false,
    sameSite: "lax",
  },
}));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api", router);

export default app;
