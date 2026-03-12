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

const AVAILABLE_MODELS = ["grok-imagine"];
const DEFAULT_MODEL = process.env.VENICE_IMAGE_EDIT_MODEL || "grok-imagine";
const LANDING_ART_MODEL = process.env.VENICE_LANDING_ART_MODEL || "nano-banana-2";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || 12) || 12) * 1024 * 1024,
  },
});

const PRESETS = {
  mei_banner: {
    label: "MEI Banner",
    promptTemplate:
      "Add a polished, fun MEI event banner reading 'MEI 2026 F2F Meeting' across the top. Keep the people exactly the same. Add colorful nautical accents in the background.",
  },
  boston_watercolor: {
    label: "Watercolor Boston Skyline",
    promptTemplate:
      "Place the same people into a watercolor background of the Boston skyline with recognizable Boston landmarks, soft paper texture, and elegant conference vibes.",
  },
  funny_caricature: {
    label: "Funny Caricature",
    promptTemplate:
      "Create a funny caricature look with playful exaggeration in expression only, while preserving identity and making sure each person is still clearly recognizable.",
  },
  lobsters_flying: {
    label: "Lobsters Flying",
    promptTemplate:
      "Add whimsical flying lobsters around the scene with confetti and nautical energy, while keeping all people unchanged and realistic.",
  },
  ride_the_wave: {
    label: "Ride the Wave",
    promptTemplate:
      "Place people in the image riding a dramatic stylized wave with ocean spray and event lighting, keeping faces and body identity intact.",
  },
  neon_clothes: {
    label: "Neon Outfit Glow",
    promptTemplate:
      "Add seamless neon light accents on clothes and accessories, integrated naturally with scene lighting, preserving exact person identity.",
  },
  custom_team_banner: {
    label: "Custom Team Banner",
    promptTemplate:
      "Add a top banner with team name '{{TEAM_NAME}}' and include a smaller sign saying 'MEI 2026'. Make it look naturally composited, fun, and conference-ready.",
  },
};

function buildInstruction({ presetKey, teamName = "" }) {
  const preset = PRESETS[presetKey] || PRESETS.mei_banner;

  const identityGuardrail = [
    "CRITICAL: Do not alter the people themselves.",
    "Keep the exact same faces, body proportions, skin tones, age, and identity-defining features.",
    "No face swaps, no person replacement, no age changes, and no beauty filter effects.",
    "Only modify environment, props, overlays, and artistic style around the original photo.",
    "The source photo composition and person identity must remain unchanged.",
  ].join(" ");

  const finalTeamName = String(teamName || "").trim() || "YOUR TEAM NAME";
  const presetPrompt = preset.promptTemplate.replaceAll("{{TEAM_NAME}}", finalTeamName);

  return `${identityGuardrail} Preset direction: ${presetPrompt}`;
}

let cachedLandingArt = null;

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
      prompt: value.promptTemplate,
    })),
    models: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL,
  });
});

app.get("/api/landing-art", async (_req, res) => {
  try {
    if (cachedLandingArt) {
      return res.json({ imageBase64: cachedLandingArt, cached: true });
    }

    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "VENICE_API_KEY missing on server" });
    }

    const payload = {
      modelId: LANDING_ART_MODEL,
      width: 1344,
      height: 768,
      prompt:
        "Fun colorful lobster mascot design for an event landing page. Include a banner that reads 'MEI 2026 F2F Meeting'. Nautical Boston harbor vibe, playful but premium, vibrant blues/cyans/corals/yellows, clean readable composition with room for UI overlays.",
      format: "png",
    };

    const veniceResp = await fetch("https://api.venice.ai/api/v1/image/generate", {
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
        error: "Venice landing-art generate failed",
        details: text.slice(0, 500),
      });
    }

    const contentType = veniceResp.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await veniceResp.json();
      const b64 =
        data?.imageBase64 ||
        data?.images?.[0]?.base64 ||
        data?.data?.[0]?.b64_json ||
        data?.result?.[0]?.base64;

      if (!b64) {
        return res.status(500).json({ error: "Landing art response did not include base64 image" });
      }

      cachedLandingArt = `data:image/png;base64,${b64}`;
      return res.json({ imageBase64: cachedLandingArt, cached: false });
    }

    const arrBuf = await veniceResp.arrayBuffer();
    const base64 = Buffer.from(arrBuf).toString("base64");
    cachedLandingArt = `data:image/png;base64,${base64}`;

    return res.json({ imageBase64: cachedLandingArt, cached: false });
  } catch (err) {
    return res.status(500).json({
      error: "Landing art generation error",
      details: err instanceof Error ? err.message : "unknown",
    });
  }
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

    const presetKey = String(req.body.preset || "mei_banner");
    const teamName = String(req.body.teamName || "");
    const aspectRatio = String(req.body.aspectRatio || "auto");
    const requestedModel = String(req.body.modelId || DEFAULT_MODEL);
    const modelId = AVAILABLE_MODELS.includes(requestedModel)
      ? requestedModel
      : (AVAILABLE_MODELS.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : "grok-imagine");

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
  console.log(`MEI Photo Booth listening on :${port}`);
});