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

const AVAILABLE_MODELS = ["grok-imagine-edit"];
const DEFAULT_MODEL = process.env.VENICE_IMAGE_EDIT_MODEL || "grok-imagine-edit";

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
    promptTemplate:
      "Professional seaside portrait photo of the subject standing on a rustic New England lobster dock at golden hour, colorful lobster traps stacked nearby, calm harbor water reflecting warm sunlight, classic lobster boats in the background, soft ocean breeze, cinematic lighting, ultra detailed, vibrant maritime colors, joyful atmosphere, natural smile, high-end photography",
  },
  watercolor_harbor: {
    label: "Watercolor Harbor",
    icon: "🎨",
    promptTemplate:
      "Elegant watercolor painting portrait of the subject in a charming coastal harbor scene with lobster boats and colorful buoys floating in the water, soft ocean mist in the distance, gentle pastel watercolor brush strokes, artistic paper texture, warm sunlight, dreamy seaside atmosphere, the subject smiling warmly, whimsical and beautiful",
  },
  hand_caricature: {
    label: "Caricature",
    icon: "✏️",
    promptTemplate:
      "Hand-painted caricature illustration of the subject with playful proportions and expressive features, standing in a vibrant New England lobster harbor full of fishing boats, lobster traps, ropes, and colorful buoys, bright cheerful colors, textured brush painting style, fun exaggerated expression, joyful personality, subject smiling brightly",
  },
  lobster_captain: {
    label: "Lobster Captain",
    icon: "⚓",
    promptTemplate:
      "Epic portrait of the subject as a legendary lobster boat captain standing proudly on the deck of a fishing vessel, dramatic ocean horizon behind them, stacks of lobster traps, seagulls flying overhead, golden sunset reflecting off the sea, cinematic lighting, heroic maritime atmosphere, ultra detailed, powerful composition",
  },
  team_banner: {
    label: "Team Banner",
    icon: "🚩",
    promptTemplate:
      "Group portrait with the subject standing together like a proud crew on a scenic harbor dock, a large elegant maritime banner behind them displaying the team name '{{TEAM_NAME}}' in beautiful classic nautical lettering, with 'MEI 2026' written below it in smaller elegant font, festive harbor atmosphere, lobster traps and boats nearby, warm celebratory lighting",
  },
  coastal_celebration: {
    label: "Coastal Celebration",
    icon: "🎉",
    promptTemplate:
      "Vibrant seaside celebration portrait with the subject standing near a festive lobster shack by the harbor, colorful string lights, lobster traps and buoys decorating the dock, glowing sunset sky over the ocean, joyful coastal summer vibes, cinematic lighting, ultra detailed, beautiful atmosphere",
  },
  ai_future: {
    label: "AI Future",
    icon: "🤖",
    promptTemplate:
      "Futuristic cyberpunk coastal city filled with advanced AI technology, glowing neon buildings, holographic ocean waves, robotic lobster drones flying overhead, neon lights reflecting off wet streets, vibrant sci-fi atmosphere, dramatic lighting, highly detailed futuristic world. A glowing neon sign reads: 'Made with ❤️ by Medical AI'.",
  },
};

function buildInstruction({ presetKey, teamName = "" }) {
  const preset = PRESETS[presetKey];
  if (!preset) {
    return "Transform this image with a fun nautical theme while keeping the person completely unchanged.";
  }

  const identityGuardrail = [
    "CRITICAL INSTRUCTION: The person in the photo must remain COMPLETELY UNCHANGED.",
    "Preserve exact face, expression, body proportions, skin tone, age, and all identity features.",
    "NO face swaps, NO person replacement, NO age changes, NO beauty filters.",
    "Only modify the environment, background, lighting, and artistic style around the person.",
    "The person's pose, clothing, and appearance must be pixel-perfect preserved.",
  ].join(" ");

  const finalTeamName = String(teamName || "").trim() || "YOUR TEAM";
  const presetPrompt = preset.promptTemplate.replaceAll("{{TEAM_NAME}}", finalTeamName);

  return `${identityGuardrail} CREATIVE DIRECTION: ${presetPrompt}`;
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
      prompt: value.promptTemplate,
    }));

  res.json({
    presets: publicPresets,
    models: AVAILABLE_MODELS,
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
    const aspectRatio = String(req.body.aspectRatio || "auto");
    const requestedModel = String(req.body.modelId || DEFAULT_MODEL);
    const modelId = AVAILABLE_MODELS.includes(requestedModel)
      ? requestedModel
      : AVAILABLE_MODELS.includes(DEFAULT_MODEL)
        ? DEFAULT_MODEL
        : "grok-imagine-edit";

    const prompt = buildInstruction({ presetKey, teamName });

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
      promptUsed: prompt,
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
