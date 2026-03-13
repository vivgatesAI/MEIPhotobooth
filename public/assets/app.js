/* ═══════════════════════════════════════════
   MEI AI Photo Booth 2026 — App Logic
   ═══════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const welcomeView   = $("welcomeView");
const cameraView    = $("cameraView");
const previewView   = $("previewView");
const consentModal  = $("consentModal");
const teamModal     = $("teamModal");

const startBtn         = $("startBtn");
const agreeConsentBtn  = $("agreeConsentBtn");
const cancelConsentBtn = $("cancelConsentBtn");
const homeBtn          = $("homeBtn");
const previewHomeBtn   = $("previewHomeBtn");
const flipBtn          = $("flipBtn");

const video         = $("video");
const captureCanvas = $("captureCanvas");
const previewImg    = $("previewImg");
const resultImg     = $("resultImg");

const captureBtn  = $("captureBtn");
const downloadBtn = $("downloadBtn");

const uploadInput       = $("uploadInput");
const uploadFromWelcome = $("uploadFromWelcome");

const presetGrid    = $("presetGrid");
const teamNameInput = $("teamNameInput");
const cancelTeamBtn = $("cancelTeamBtn");
const confirmTeamBtn = $("confirmTeamBtn");

const splashOverlay = $("splashOverlay");
const splashTitle   = $("splashTitle");
const splashMessage = $("splashMessage");
const secretLobster = $("secretLobster");

const statusEl = $("status");

let stream = null;
let sourceBlob = null;
let outputDataUrl = null;
let selectedPreset = "lobster_dock";
let presets = [];
let facingMode = "user";
const modelId = "grok-imagine-edit";

const splashLines = [
  { title: "Cooking up the magic…",  message: "Our lobster artists are polishing your scene." },
  { title: "Tuning the tide…",       message: "Adding wave motion and maritime energy." },
  { title: "Almost there…",          message: "Balancing colors, banners and fun details." },
  { title: "Setting sail…",          message: "Your masterpiece is on its way." },
];

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function show(view) {
  [welcomeView, cameraView, previewView].forEach((v) => v.classList.remove("active"));
  view.classList.add("active");
}

function goHome() {
  stopCamera();
  show(welcomeView);
  setStatus("");
}

/* ── Presets ── */

function renderPresets() {
  presetGrid.innerHTML = "";
  presets.forEach((p) => {
    const card = document.createElement("button");
    card.className = `preset-card${p.key === selectedPreset ? " active" : ""}`;
    card.innerHTML = `<span class="preset-icon">${p.icon || ""}</span><span class="preset-label">${p.label}</span>`;
    card.onclick = () => handlePresetClick(p);
    presetGrid.appendChild(card);
  });
}

async function handlePresetClick(preset) {
  selectedPreset = preset.key;
  renderPresets();

  if (preset.key === "team_banner") {
    showTeamModal();
    return;
  }

  if (sourceBlob) await applyStyle();
}

function showTeamModal() {
  teamModal.classList.remove("hidden");
  teamNameInput.value = "";
  setTimeout(() => teamNameInput.focus(), 100);
}

function hideTeamModal() {
  teamModal.classList.add("hidden");
}

async function loadConfig() {
  try {
    const resp = await fetch("/api/config");
    const data = await resp.json();
    if (Array.isArray(data?.presets) && data.presets.length) {
      presets = data.presets;
      if (!presets.some((p) => p.key === selectedPreset)) selectedPreset = presets[0].key;
      renderPresets();
      setStatus("Ready · Choose a style above");
    }
  } catch {
    setStatus("Could not load presets");
  }
}

/* ── Camera ── */

async function enableCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    captureBtn.disabled = false;
    previewImg.style.display = "none";
    video.style.display = "block";
    show(cameraView);
    setStatus("Camera ready");
  } catch {
    setStatus("Camera unavailable — please upload a photo.");
  }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function flipCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  stopCamera();
  await enableCamera();
}

/* ── Capture & Upload ── */

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function capturePhoto() {
  if (!video.videoWidth) return;
  captureCanvas.width = video.videoWidth;
  captureCanvas.height = video.videoHeight;
  captureCanvas.getContext("2d").drawImage(video, 0, 0);
  const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.92);
  sourceBlob = dataUrlToBlob(dataUrl);
  outputDataUrl = dataUrl;
  resultImg.src = dataUrl;
  stopCamera();
  show(previewView);
  setStatus("Captured — tap a style to transform!");
}

async function setUploadAsSource(file) {
  const dataUrl = await readFileAsDataURL(file);
  sourceBlob = file;
  outputDataUrl = dataUrl;
  resultImg.src = dataUrl;
  show(previewView);
  setStatus("Uploaded — tap a style to transform!");
}

/* ── AI Style Application ── */

function showSplash() {
  const line = splashLines[Math.floor(Math.random() * splashLines.length)];
  splashTitle.textContent = line.title;
  splashMessage.textContent = line.message;
  splashOverlay.classList.remove("hidden");
}

function hideSplash() {
  splashOverlay.classList.add("hidden");
}

async function applyStyle() {
  if (!sourceBlob) return;
  showSplash();
  setStatus("Applying style…");

  const fd = new FormData();
  fd.append("image", sourceBlob, "input.jpg");
  fd.append("preset", selectedPreset);
  fd.append("modelId", modelId);
  fd.append("teamName", (teamNameInput?.value || "").trim());
  fd.append("aspectRatio", window.innerHeight > window.innerWidth ? "4:5" : "16:9");

  try {
    const resp = await fetch("/api/edit", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Edit failed");
    outputDataUrl = data.imageBase64;
    resultImg.src = outputDataUrl;
    setStatus(`Done: ${data.presetUsed} via ${data.modelUsed}`);
  } catch (e) {
    setStatus(e.message || "Error applying style");
  } finally {
    hideSplash();
  }
}

/* ── Download ── */

function downloadCurrent() {
  if (!outputDataUrl) return;
  const a = document.createElement("a");
  a.href = outputDataUrl;
  a.download = `mei-photobooth-${Date.now()}.png`;
  a.click();
}

/* ── Secret Easter Egg ── */

let secretTaps = 0;
let secretTimer = null;

function handleSecretLobster() {
  secretTaps++;
  clearTimeout(secretTimer);
  if (secretTaps >= 3) {
    secretTaps = 0;
    selectedPreset = "ai_future";
    renderPresets();
    if (sourceBlob) applyStyle();
  } else {
    secretTimer = setTimeout(() => { secretTaps = 0; }, 800);
  }
}

/* ── Event Bindings ── */

startBtn.onclick = () => consentModal.classList.remove("hidden");

agreeConsentBtn.onclick = async () => {
  consentModal.classList.add("hidden");
  await enableCamera();
};

cancelConsentBtn.onclick = () => consentModal.classList.add("hidden");

homeBtn.onclick = goHome;
previewHomeBtn.onclick = goHome;
flipBtn.onclick = flipCamera;
captureBtn.onclick = capturePhoto;
downloadBtn.onclick = downloadCurrent;

uploadInput.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) await setUploadAsSource(f);
};

uploadFromWelcome.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) await setUploadAsSource(f);
};

cancelTeamBtn.onclick = hideTeamModal;

confirmTeamBtn.onclick = async () => {
  const name = (teamNameInput?.value || "").trim();
  if (!name) {
    teamNameInput.focus();
    return;
  }
  hideTeamModal();
  if (sourceBlob) await applyStyle();
};

teamNameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmTeamBtn.click();
});

if (secretLobster) {
  secretLobster.onclick = handleSecretLobster;
}

/* ── Init ── */
loadConfig();
