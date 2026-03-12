const appRoot = document.getElementById("appRoot");
const welcomeView = document.getElementById("welcomeView");
const cameraView = document.getElementById("cameraView");
const previewView = document.getElementById("previewView");
const consentModal = document.getElementById("consentModal");

const startBtn = document.getElementById("startBtn");
const agreeConsentBtn = document.getElementById("agreeConsentBtn");
const cancelConsentBtn = document.getElementById("cancelConsentBtn");
const homeBtn = document.getElementById("homeBtn");
const previewHomeBtn = document.getElementById("previewHomeBtn");

const video = document.getElementById("video");
const captureCanvas = document.getElementById("captureCanvas");
const previewImg = document.getElementById("previewImg");
const resultImg = document.getElementById("resultImg");

const captureBtn = document.getElementById("captureBtn");
const downloadBtn = document.getElementById("downloadBtn");
const randomPresetBtn = document.getElementById("randomPresetBtn");

const uploadInput = document.getElementById("uploadInput");
const uploadFromWelcome = document.getElementById("uploadFromWelcome");

const presetGrid = document.getElementById("presetGrid");
const promptList = document.getElementById("promptList");
const teamNameWrap = document.getElementById("teamNameWrap");
const teamNameInput = document.getElementById("teamNameInput");

const splashOverlay = document.getElementById("splashOverlay");
const splashTitle = document.getElementById("splashTitle");
const splashMessage = document.getElementById("splashMessage");

const statusEl = document.getElementById("status");

let stream = null;
let sourceBlob = null;
let outputDataUrl = null;
let selectedPreset = "mei_banner";
let presets = [];
const modelId = "grok-imagine-edit";

const splashLines = [
  { title: "Cooking up the magic…", message: "Our lobster artists are polishing your scene." },
  { title: "Tuning the tide…", message: "Adding wave motion and MEI event energy." },
  { title: "Almost there…", message: "Balancing colors, banners and fun details." },
];

function setStatus(m) {
  statusEl.textContent = m || `Ready · Model: ${modelId}`;
}

function show(v) {
  [welcomeView, cameraView, previewView].forEach((el) => el.classList.remove("active"));
  v.classList.add("active");
}

function goHome() {
  stopCamera();
  show(welcomeView);
  setStatus(`Ready · Model: ${modelId}`);
}

function setLandingBackground(dataUrl) {
  const backdrop = document.querySelector(".welcome-backdrop");
  if (backdrop && dataUrl) backdrop.style.backgroundImage = `url('${dataUrl}')`;
}

async function loadLandingArt() {
  try {
    const resp = await fetch("/api/landing-art");
    if (!resp.ok) return;
    const data = await resp.json();
    if (data?.imageBase64) setLandingBackground(data.imageBase64);
  } catch {
    // non-blocking visual enhancement
  }
}

function renderPrompts() {
  promptList.innerHTML = "";
  presets.forEach((p) => {
    const item = document.createElement("div");
    item.className = "prompt-item";
    item.innerHTML = `<strong>${p.label}</strong><span>${p.prompt}</span>`;
    promptList.appendChild(item);
  });
}

function renderPresets() {
  presetGrid.innerHTML = "";
  presets.forEach((p) => {
    const b = document.createElement("button");
    b.className = `preset-pill ${p.key === selectedPreset ? "active" : ""}`;
    b.textContent = p.label;
    b.onclick = async () => {
      selectedPreset = p.key;
      renderPresets();
      teamNameWrap.classList.toggle("hidden", selectedPreset !== "custom_team_banner");
      if (sourceBlob) await applyStyle();
    };
    presetGrid.appendChild(b);
  });
}

function pickRandomPreset() {
  if (!presets.length) return;
  const pool = presets.filter((p) => p.key !== selectedPreset);
  const next = pool[Math.floor(Math.random() * pool.length)] || presets[0];
  selectedPreset = next.key;
  renderPresets();
  teamNameWrap.classList.toggle("hidden", selectedPreset !== "custom_team_banner");
  if (sourceBlob) applyStyle();
}

async function loadConfig() {
  try {
    const resp = await fetch("/api/config");
    const data = await resp.json();
    if (Array.isArray(data?.presets) && data.presets.length) {
      presets = data.presets;
      if (!presets.some((p) => p.key === selectedPreset)) selectedPreset = presets[0].key;
      renderPresets();
      renderPrompts();
      setStatus(`Ready · Model: ${modelId}`);
    }
  } catch {
    setStatus("Could not load presets");
  }
}

async function enableCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    captureBtn.disabled = false;
    previewImg.style.display = "none";
    video.style.display = "block";
    show(cameraView);
    setStatus("Camera ready");
  } catch {
    setStatus("Camera unavailable. Please upload.");
  }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

async function readFileAsDataURL(file) {
  return await new Promise((resolve, reject) => {
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
  show(previewView);
  setStatus("Captured. Tap a style to apply.");
}

async function setUploadAsSource(file) {
  const dataUrl = await readFileAsDataURL(file);
  sourceBlob = file;
  outputDataUrl = dataUrl;
  resultImg.src = dataUrl;
  show(previewView);
  setStatus("Uploaded. Tap a style to apply.");
}

function showSplash() {
  const random = splashLines[Math.floor(Math.random() * splashLines.length)];
  splashTitle.textContent = random.title;
  splashMessage.textContent = random.message;
  splashOverlay.classList.remove("hidden");
}

function hideSplash() {
  splashOverlay.classList.add("hidden");
}

async function applyStyle() {
  if (!sourceBlob) return;
  showSplash();
  setStatus("Applying style...");

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
    setStatus(e.message || "Error");
  } finally {
    hideSplash();
  }
}

function downloadCurrent() {
  if (!outputDataUrl) return;
  const a = document.createElement("a");
  a.href = outputDataUrl;
  a.download = `mei-photobooth-${Date.now()}.png`;
  a.click();
}

startBtn.onclick = () => consentModal.classList.remove("hidden");
agreeConsentBtn.onclick = async () => {
  consentModal.classList.add("hidden");
  await enableCamera();
};
cancelConsentBtn.onclick = () => consentModal.classList.add("hidden");
homeBtn.onclick = goHome;
previewHomeBtn.onclick = goHome;
captureBtn.onclick = capturePhoto;
downloadBtn.onclick = downloadCurrent;
randomPresetBtn.onclick = pickRandomPreset;

uploadInput.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) await setUploadAsSource(f);
};
uploadFromWelcome.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) await setUploadAsSource(f);
};

teamNameInput?.addEventListener("change", async () => {
  if (selectedPreset === "custom_team_banner" && sourceBlob) await applyStyle();
});

loadConfig();
loadLandingArt();