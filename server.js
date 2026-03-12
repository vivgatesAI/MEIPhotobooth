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

const AVAILABLE_MODELS = [
  "qwen-edit",
  "flux-2-max-edit",
  "gpt-image-1-5-edit",
  "seedream-v4-edit",
  "nano-banana-pro-edit",
];

const DEFAULT_MODEL = process.env.VENICE_IMAGE_EDIT_MODEL || "qwen-edit";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || 12) || 12) * 1024 * 1024,
  },
});

const PRESETS = {
  mei_massachusetts: {
    label: "MEI · Boston Skyline",
    stylePrompt:
      "Photoreal Boston skyline backdrop at golden hour, subtle MEI conference branding elements, polished medical engagement event atmosphere, clean modern lighting, tasteful futuristic-retro-aquarium color accents",
  },
  lobster_harbor: {
    label: "Lobster Harbor",
    stylePrompt:
      "Boston harbor waterfront scene with iconic lobster-themed visual storytelling, premium editorial look, warm red-orange accents, cinematic natural light, keep setting realistic and event-ready",
  },
  retro_aquarium: {
    label: "Retro Aquarium",
    stylePrompt:
      "Futuristic retro aquarium environment with glass architecture, teal and amber glow, subtle volumetric light beams, high-end cinematic realism",
  },
  clinical_future: {
    label: "Clinical Future",
    stylePrompt:
      "Advanced Boston medical innovation campus background, refined glass interiors, clean white-and-blue palette, subtle holographic interfaces, realistic premium conference portrait style",
  },
  beacon_night: {
    label: "Beacon Night",
    stylePrompt:
      "Boston night skyline with crisp city lights and beacon glow, elegant event portrait mood, balanced contrast, polished editorial finish",
  },
  custom: {
    label: "Custom",
    stylePrompt: "",
  },
};

function buildInstruction({ presetKey, customPrompt, softerStyle = false }) {
  const preset = PRESETS[presetKey] || PRESETS.retro_aquarium;
  const custom = (customPrompt || "").trim();

  const likenessGuardrail = [
    "CRITICAL IDENTITY REQUIREMENT:",
    "Preserve the exact identity and likeness of every person in the image.",
    "Do not change facial structure, skin tone, age impression, body shape, or identity-defining features.",
    "Keep hairline, eyes, nose, mouth, and overall recognizability faithful to the original.",
    "Do not beautify or age-shift the subject.",
    "Only transform styling, wardrobe accents (non-destructive), lighting, and background environment.",
    "Output should look like the same real person photographed in a new scene.",
  ].join(" ");

  const styleTarget =
    presetKey === "custom"
      ? `User custom direction: ${custom || "Apply elegant futuristic retro aquarium event styling with tasteful Boston medical conference context."}`
      : `Preset direction: ${preset.stylePrompt}`;

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
      thumbnail: `/assets/presets/${key}.png`,
    })),
    models: AVAILABLE_MODELS,
    defaultModel: AVAILABLE_MODELS.includes(DEFAULT_MODEL)
      ? DEFAULT_MODEL
      : "qwen-edit",
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

    const presetKey = String(req.body.preset || "retro_aquarium");
    const customPrompt = String(req.body.customPrompt || "");
    const aspectRatio = String(req.body.aspectRatio || "auto");
    const softerStyle = String(req.body.softerStyle || "false") === "true";
    const requestedModel = String(req.body.modelId || DEFAULT_MODEL);
    const modelId = AVAILABLE_MODELS.includes(requestedModel)
      ? requestedModel
      : (AVAILABLE_MODELS.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : "qwen-edit");

    const prompt = buildInstruction({ presetKey, customPrompt, softerStyle });

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