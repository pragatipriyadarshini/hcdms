import express from "express";
import appRoutes from "./routes/index.js";
import cors from "cors";
import multer from "multer";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

app.use("/api", appRoutes);

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_UNEXPECTED_FILE"
        ? "Too many files or unsupported upload field. Use field name \"file\" and upload up to 25 CSV files."
        : error.message;

    return res.status(400).json({
      status: "error",
      message,
    });
  }

  return next(error);
});

export default app;
