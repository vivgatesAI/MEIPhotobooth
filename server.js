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

const DEFAULT_MODEL = process.env.VENICE_IMAGE_EDIT_MODEL || "grok-imagine-edit";

const MODELS = {
  "grok-imagine-edit":      { name: "Grok Imagine",      price: 0.04, ratios: ["auto","1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "qwen-edit":              { name: "Qwen Edit",          price: 0.04, ratios: ["auto","1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "qwen-image-2-edit":      { name: "Qwen Image 2",       price: 0.05, ratios: ["1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "seedream-v4-edit":       { name: "SeedreamV4.5",       price: 0.05, ratios: ["auto","1:1","3:2","16:9","9:16","2:3","3:4","4:5"] },
  "seedream-v5-lite-edit":  { name: "SeedreamV5 Lite",    price: 0.05, ratios: ["auto","1:1","3:2","16:9","9:16","2:3","3:4","4:5"] },
  "flux-2-max-edit":        { name: "Flux 2 Max",         price: 0.09, ratios: ["auto","1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "qwen-image-2-pro-edit":  { name: "Qwen Image 2 Pro",   price: 0.10, ratios: ["1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "nano-banana-2-edit":     { name: "Nano Banana 2",      price: 0.10, ratios: ["auto","1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "nano-banana-pro-edit":   { name: "Nano Banana Pro",    price: 0.18, ratios: ["auto","1:1","3:2","16:9","21:9","9:16","2:3","3:4","4:5"] },
  "gpt-image-1-5-edit":     { name: "GPT Image 1.5",      price: 0.36, ratios: ["auto","1:1","3:2","2:3"] },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || 12) || 12) * 1024 * 1024,
  },
});

const PRESETS = {
  lobster_dock: {
    label: "Lobster Dock",
    icon: "🦞",
    prompt: "Photo of the person on a New England lobster dock at golden hour. Fun cartoon lobsters in the background — peeking from traps, waving claws, wearing tiny captain hats. Lobster traps, harbor boats, warm cinematic lighting, vibrant colors.",
  },
  watercolor_boston: {
    label: "Watercolor Boston",
    icon: "🎨",
    prompt: "Watercolor painting of the person with the Boston skyline behind them — Zakim Bridge, Custom House Tower, harbor sailboats. Soft pastel watercolor brush strokes, warm amber sunset, dreamy atmosphere, smiling warmly.",
  },
  hand_caricature: {
    label: "Caricature",
    icon: "✏️",
    prompt: "Hand-painted caricature of the person with playful exaggerated proportions. New England lobster harbor background, fishing boats, lobster traps, colorful buoys. Bright cheerful colors, fun expression, smiling brightly.",
  },
  hollywood_poster: {
    label: "Movie Poster",
    icon: "🎬",
    prompt: "Dramatic Hollywood movie poster of the person. Cinematic lighting, bold colors, shallow depth of field, heroic pose. Title 'MEI 2026' in bold cinematic metallic lettering at the bottom. Film grain, dramatic sky, lens flare.",
  },
  pixar_3d: {
    label: "Pixar 3D",
    icon: "🧸",
    prompt: "Pixar-style 3D animated cartoon character version of the person. Smooth stylized skin, large expressive eyes, vibrant colors, Pixar studio lighting, playful colorful background, cheerful expression.",
  },
  team_banner: {
    label: "Team Banner",
    icon: "🚩",
    prompt: "The person with a large maritime banner behind them showing '{{TEAM_NAME}}' in gold nautical lettering on a navy ribbon, 'MEI 2026' below. Clean event photography, warm lighting, no extra people.",
  },
  ai_future: {
    label: "AI Future",
    icon: "🤖",
    prompt: "The person in a futuristic cyberpunk coastal city. Neon buildings, holographic ocean waves, robotic lobster drones flying overhead, neon reflections on wet streets. Glowing neon sign reads 'Made with ❤️ by Medical AI'.",
  },
};

function getSafeAspectRatio(requested, modelId) {
  const model = MODELS[modelId];
  if (!model) return "auto";
  if (model.ratios.includes(requested)) return requested;
  const fallbacks = ["4:5", "3:4", "auto", "1:1"];
  return fallbacks.find((r) => model.ratios.includes(r)) || model.ratios[0];
}

function buildPrompt({ presetKey, teamName = "" }) {
  const preset = PRESETS[presetKey];
  if (!preset) return "Transform this photo with a fun nautical coastal theme.";
  const finalTeamName = String(teamName || "").trim() || "YOUR TEAM";
  return preset.prompt.replaceAll("{{TEAM_NAME}}", finalTeamName);
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mei-photobooth" });
});

app.get("/api/config", (_req, res) => {
  const publicPresets = Object.entries(PRESETS)
    .filter(([key]) => key !== "ai_future")
    .map(([key, value]) => ({
      key,
      label: value.label,
      icon: value.icon,
    }));

  const models = Object.entries(MODELS).map(([id, m]) => ({
    id,
    name: m.name,
    price: m.price,
  }));

  res.json({
    presets: publicPresets,
    models,
    defaultModel: DEFAULT_MODEL,
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

    const presetKey = String(req.body.preset || "lobster_dock");
    const teamName = String(req.body.teamName || "");
    const requestedRatio = String(req.body.aspectRatio || "auto");
    const requestedModel = String(req.body.modelId || DEFAULT_MODEL);
    const modelId = MODELS[requestedModel] ? requestedModel : DEFAULT_MODEL;
    const aspectRatio = getSafeAspectRatio(requestedRatio, modelId);

    const prompt = buildPrompt({ presetKey, teamName });

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
  console.log(`🦞 MEI Photo Booth listening on :${port}`);
});
