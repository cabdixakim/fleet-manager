import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ObjectStorageService } from "../lib/objectStorage";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const memStorage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images and PDFs are allowed"));
  },
});

const logoUpload = multer({
  storage: memStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, or WebP images are allowed for logos"));
  },
});

const router = Router();

function requireSession(req: any, res: any, next: any) {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    console.warn("[uploads] requireSession: no session userId — returning 401. session:", JSON.stringify(req.session));
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.post("/uploads", requireSession, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, originalName: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
});

const clearanceUpload = multer({
  storage: memStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images and PDF files are allowed for clearance documents"));
  },
});

router.post("/uploads/clearance", requireSession, clearanceUpload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL("clearances");
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });

    if (!uploadRes.ok) {
      console.error("GCS upload failed:", uploadRes.status, await uploadRes.text());
      return res.status(500).json({ error: "Failed to upload to storage" });
    }

    const serveUrl = `/api/storage${objectPath}`;
    res.json({ url: serveUrl, objectPath });
  } catch (err) {
    next(err);
  }
});

router.post("/uploads/logo", requireSession, logoUpload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL("logos");
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });

    if (!uploadRes.ok) {
      console.error("GCS upload failed:", uploadRes.status, await uploadRes.text());
      return res.status(500).json({ error: "Failed to upload to storage" });
    }

    const serveUrl = `/api/storage${objectPath}`;
    res.json({ url: serveUrl, objectPath });
  } catch (err) {
    next(err);
  }
});

export default router;
