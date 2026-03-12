import express from "express";
import dotenv from "dotenv";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3100);

const AVAILABLE_MODELS = ["qwen-edit"];

const DEFAULT_MODEL = "qwen-edit";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || 12) || 12) * 1024 * 1024,
  },
});

const PRESETS = {
  watercolor_boston: {
    label: "Watercolor Boston",
    stylePrompt:
      "Transform into a refined watercolor portrait style with soft brush textures and a tasteful Boston skyline background, pastel palette, artistic paper grain, premium event-poster feel.",
  },
  sketch_wave: {
    label: "Sketch + Wave",
    stylePrompt:
      "Convert subject to elegant pencil-and-ink sketch linework while preserving identity, with a watercolor Boston skyline background and the phrase 'MEI Ride the Wave' integrated tastefully.",
  },
  neon_sign: {
    label: "Neon Sign",
    stylePrompt:
      "Create a vibrant neon-night portrait scene with glowing signage and city ambiance, cinematic magenta-cyan highlights, polished photobooth energy.",
  },
  aquarium_glow: {
    label: "Aquarium Glow",
    stylePrompt:
      "Place subject in a luminous futuristic aquarium environment with flowing light beams, glass reflections, teal-blue glow, dreamy yet realistic details.",
  },
  mei_2026_banner: {
    label: "MEI 2026 Banner",
    stylePrompt:
      "Create an event portrait with a clean celebratory top banner reading 'MEI 2026', modern conference styling, balanced lighting, and subtle Boston context.",
  },
  boston_poster: {
    label: "Boston Poster",
    stylePrompt:
      "High-impact editorial poster style portrait with dramatic Boston skyline backdrop, bold composition, crisp contrast, and premium conference branding mood.",
  },
};

function buildInstruction({ presetKey, softerStyle = false }) {
  const preset = PRESETS[presetKey] || PRESETS.watercolor_boston;

  const likenessGuardrail = [
    "CRITICAL IDENTITY REQUIREMENT:",
    "Preserve the exact identity and likeness of every person in the image.",
    "Do not change facial structure, skin tone, age impression, body shape, or identity-defining features.",
    "Keep hairline, eyes, nose, mouth, and overall recognizability faithful to the original.",
    "Do not beautify or age-shift the subject.",
    "Only transform styling, wardrobe accents (non-destructive), lighting, and background environment.",
    "Output should look like the same real person photographed in a new scene.",
  ].join(" ");

  const styleTarget = `Preset direction: ${preset.stylePrompt}`;

  const softness = softerStyle
    ? "Apply this style at lower intensity, keep result natural and realistic, avoid over-stylization."
    : "Apply style clearly but keep realism and identity fidelity.";

  return `${likenessGuardrail} ${styleTarget} ${softness}`;
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mei-photobooth" });
});

app.get("/api/config", (_req, res) => {
  res.json({
    presets: Object.entries(PRESETS).map(([key, value]) => ({
      key,
      label: value.label,
    })),
    models: AVAILABLE_MODELS,
    defaultModel: "qwen-edit",
  });
});

app.post("/api/edit", upload.single("image"), async (req, res) => {
  try {
    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "VENICE_API_KEY missing on server" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }

    const presetKey = String(req.body.preset || "watercolor_boston");
    const aspectRatio = String(req.body.aspectRatio || "auto");
    const softerStyle = String(req.body.softerStyle || "false") === "true";
    const requestedModel = String(req.body.modelId || DEFAULT_MODEL);
    const modelId = AVAILABLE_MODELS.includes(requestedModel)
      ? requestedModel
      : (AVAILABLE_MODELS.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : "qwen-edit");

    const prompt = buildInstruction({ presetKey, softerStyle });

    const payload = {
      image: req.file.buffer.toString("base64"),
      prompt,
      modelId,
      aspect_ratio: aspectRatio,
    };

    const veniceResp = await fetch("https://api.venice.ai/api/v1/image/edit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!veniceResp.ok) {
      const text = await veniceResp.text();
      return res.status(veniceResp.status).json({
        error: "Venice edit request failed",
        details: text.slice(0, 500),
      });
    }

    const arrBuf = await veniceResp.arrayBuffer();
    const base64 = Buffer.from(arrBuf).toString("base64");

    return res.json({
      imageBase64: `data:image/png;base64,${base64}`,
      presetUsed: presetKey,
      modelUsed: modelId,
      softerStyle,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Unexpected server error",
      details: err instanceof Error ? err.message : "unknown",
    });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`MEI Photo Booth listening on :${port}`);
});