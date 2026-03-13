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
      "Portrait photo of the subject with their exact face, features, and likeness perfectly preserved, standing on a rustic New England lobster dock at golden hour. Fun colorful cartoon-style lobsters are scattered in the background — some peeking from behind lobster traps, some waving claws, some wearing tiny captain hats. Colorful lobster traps stacked nearby, calm harbor water reflecting warm sunlight, classic lobster boats in the distance, cinematic lighting, ultra detailed, vibrant maritime colors, joyful atmosphere, high-end photography blended with whimsical cartoon lobster characters",
  },
  watercolor_boston: {
    label: "Watercolor Boston",
    icon: "🎨",
    promptTemplate:
      "Elegant watercolor painting portrait of the subject with their exact face, features, and likeness perfectly preserved, rendered in beautiful watercolor style. The background is the iconic Boston skyline — the Zakim Bridge, Custom House Clock Tower, and harbor sailboats — all painted in soft impressionistic watercolor brush strokes. Palette of cerulean blues, warm amber sunset tones, and soft coral accents. Artistic paper texture, warm sunlight, dreamy seaside atmosphere, the subject smiling warmly, whimsical and beautiful",
  },
  hand_caricature: {
    label: "Caricature",
    icon: "✏️",
    promptTemplate:
      "Hand-painted caricature illustration of the subject preserving their exact face likeness and recognizable features with playful proportions and expressive details, standing in a vibrant New England lobster harbor full of fishing boats, lobster traps, ropes, and colorful buoys, bright cheerful colors, textured brush painting style, fun exaggerated expression, joyful personality, subject smiling brightly",
  },
  hollywood_poster: {
    label: "Movie Poster",
    icon: "🎬",
    promptTemplate:
      "Dramatic Hollywood movie poster portrait of the subject with their exact face, features, and likeness perfectly preserved. Cinematic dramatic lighting, epic blockbuster style, bold saturated colors, shallow depth of field, heroic confident pose. The movie title 'MEI 2026' displayed prominently in bold cinematic metallic lettering at the bottom of the poster. Film grain texture, dramatic stormy sky background, lens flare, professional movie poster composition, award-winning photography",
  },
  pixar_3d: {
    label: "Pixar 3D",
    icon: "🧸",
    promptTemplate:
      "3D animated cartoon character portrait of the subject with their exact face likeness and recognizable features faithfully translated into Pixar-style 3D animation. Smooth stylized skin, large expressive eyes that match the subject's real eyes, vibrant colors, Pixar studio quality lighting with soft rim light and warm key light, playful colorful background with depth of field, cheerful happy expression, ultra detailed 3D render, Disney Pixar movie quality character",
  },
  team_banner: {
    label: "Team Banner",
    icon: "🚩",
    promptTemplate:
      "Portrait of the subject with their exact face, features, and likeness perfectly preserved. A large elegant maritime banner is placed behind them displaying the team name '{{TEAM_NAME}}' in beautiful classic nautical gold serif lettering on a navy blue ribbon with rope borders, and 'MEI 2026' in smaller elegant font below. Clean professional event photography background with soft bokeh, warm celebratory lighting, the subject is the clear focus of the image, no extra people added",
  },
  ai_future: {
    label: "AI Future",
    icon: "🤖",
    promptTemplate:
      "The subject with their exact face, features, and likeness perfectly preserved standing in a futuristic cyberpunk coastal city filled with advanced AI technology. Glowing neon buildings, holographic ocean waves, robotic lobster drones flying overhead, neon lights reflecting off wet streets, vibrant sci-fi atmosphere, dramatic lighting, highly detailed futuristic world. A glowing neon sign reads: 'Made with ❤️ by Medical AI'.",
  },
};

function buildInstruction({ presetKey, teamName = "" }) {
  const preset = PRESETS[presetKey];
  if (!preset) {
    return "Transform this image with a fun nautical theme while keeping the person completely unchanged.";
  }

  const identityGuardrail = [
    "CRITICAL INSTRUCTION: The person's FACE and LIKENESS must remain COMPLETELY UNCHANGED and perfectly recognizable.",
    "Preserve exact facial features, face shape, expression, body proportions, skin tone, age, hair, and all identity features.",
    "NO face swaps, NO person replacement, NO age changes, NO beauty filters, NO altering facial structure.",
    "The output image must look unmistakably like the same person from the input photo.",
    "Only modify the environment, background, lighting, and artistic style around the person.",
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
