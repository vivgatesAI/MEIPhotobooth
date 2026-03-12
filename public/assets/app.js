const video = document.getElementById("video");
const captureCanvas = document.getElementById("captureCanvas");
const previewImg = document.getElementById("previewImg");
const resultImg = document.getElementById("resultImg");
const startCameraBtn = document.getElementById("startCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const uploadInput = document.getElementById("uploadInput");
const clearBtn = document.getElementById("clearBtn");
const generateBtn = document.getElementById("generateBtn");
const regenerateBtn = document.getElementById("regenerateBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveLocalBtn = document.getElementById("saveLocalBtn");
const presetGrid = document.getElementById("presetGrid");
const customPrompt = document.getElementById("customPrompt");
const progressWrap = document.getElementById("progressWrap");
const statusEl = document.getElementById("status");
const modelSelect = document.getElementById("modelSelect");
const softerStyle = document.getElementById("softerStyle");
const acceptCameraBtn = document.getElementById("acceptCameraBtn");
const dismissCameraBtn = document.getElementById("dismissCameraBtn");
const preDisclaimer = document.getElementById("preDisclaimer");
const openGalleryBtn = document.getElementById("openGalleryBtn");
const galleryCard = document.getElementById("galleryCard");
const galleryGrid = document.getElementById("galleryGrid");
const clearGalleryBtn = document.getElementById("clearGalleryBtn");
const closeGalleryBtn = document.getElementById("closeGalleryBtn");

let selectedPreset = "mei_massachusetts";
let presets = [];
let capturedBlob = null;
let outputDataUrl = null;
let stream = null;

function setStatus(message, kind = "") {
  statusEl.className = `status ${kind}`;
  statusEl.textContent = message || "";
}

function storageKey() {
  return "mei.photobooth.saved";
}

function getSaved() {
  return JSON.parse(localStorage.getItem(storageKey()) || "[]");
}

function renderGallery() {
  const items = getSaved();
  galleryGrid.innerHTML = items.map((it) => `<img src="${it.image}" alt="saved" />`).join("");
}

function renderPresets() {
  presetGrid.innerHTML = "";
  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = `preset ${selectedPreset === p.key ? "active" : ""}`;
    btn.type = "button";
    btn.innerHTML = `<img src="${p.thumbnail}" alt="${p.label}" /><div>${p.label}</div>`;
    btn.onclick = () => {
      selectedPreset = p.key;
      customPrompt.style.display = selectedPreset === "custom" ? "block" : "none";
      renderPresets();
    };
    presetGrid.appendChild(btn);
  });
}

function updateGenerateAvailability() {
  const hasSource = !!capturedBlob;
  generateBtn.disabled = !hasSource;
  regenerateBtn.disabled = !hasSource;
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = stream;
    video.style.display = "block";
    previewImg.style.display = "none";
    captureBtn.disabled = false;
    setStatus("Camera ready", "ok");
  } catch (_err) {
    setStatus("Camera access denied. You can upload a photo instead.", "err");
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function captureFromVideo() {
  if (!video.videoWidth || !video.videoHeight) return;
  captureCanvas.width = video.videoWidth;
  captureCanvas.height = video.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
  const blob = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.95));
  capturedBlob = blob;
  const dataUrl = await blobToDataURL(blob);
  previewImg.src = dataUrl;
  previewImg.style.display = "block";
  video.style.display = "none";
  updateGenerateAvailability();
  setStatus("Selfie captured", "ok");
}

function clearAll() {
  capturedBlob = null;
  outputDataUrl = null;
  previewImg.src = "";
  resultImg.src = "";
  resultImg.style.display = "none";
  if (stream) video.style.display = "block";
  previewImg.style.display = "none";
  updateGenerateAvailability();
  downloadBtn.disabled = true;
  saveLocalBtn.disabled = true;
  setStatus("");
}

async function generate(isRegen = false) {
  if (!capturedBlob) return;
  progressWrap.classList.add("active");
  generateBtn.disabled = true;
  regenerateBtn.disabled = true;
  setStatus(isRegen ? "Regenerating…" : "Processing started…", "");

  const fd = new FormData();
  fd.append("image", capturedBlob, "input.jpg");
  fd.append("preset", selectedPreset);
  fd.append("modelId", modelSelect.value);
  fd.append("softerStyle", String(softerStyle.checked));
  if (selectedPreset === "custom") fd.append("customPrompt", customPrompt.value || "");
  fd.append("aspectRatio", window.innerHeight >= window.innerWidth ? "4:5" : "16:9");

  try {
    const resp = await fetch("/api/edit", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Generation failed");

    outputDataUrl = data.imageBase64;
    resultImg.src = outputDataUrl;
    resultImg.style.display = "block";
    downloadBtn.disabled = false;
    saveLocalBtn.disabled = false;
    setStatus(`Image ready (${data.modelUsed})`, "ok");
  } catch (err) {
    setStatus(err.message || "Failed to process image", "err");
  } finally {
    progressWrap.classList.remove("active");
    updateGenerateAvailability();
  }
}

function downloadResult() {
  if (!outputDataUrl) return;
  const a = document.createElement("a");
  a.href = outputDataUrl;
  a.download = `mei-photobooth-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function saveLocal() {
  if (!outputDataUrl) return;
  const existing = getSaved();
  existing.unshift({ id: Date.now(), image: outputDataUrl, preset: selectedPreset, model: modelSelect.value });
  localStorage.setItem(storageKey(), JSON.stringify(existing.slice(0, 24)));
  renderGallery();
  setStatus("Saved locally on this phone/browser", "ok");
}

async function initConfig() {
  const r = await fetch("/api/config");
  const cfg = await r.json();
  presets = cfg.presets || [];
  renderPresets();
  (cfg.models || []).forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    if (m === cfg.defaultModel) o.selected = true;
    modelSelect.appendChild(o);
  });
}

acceptCameraBtn.onclick = async () => {
  preDisclaimer.style.display = "none";
  await startCamera();
};

dismissCameraBtn.onclick = () => {
  preDisclaimer.style.display = "none";
  setStatus("Upload a photo to continue", "ok");
};

startCameraBtn.onclick = startCamera;
captureBtn.onclick = captureFromVideo;
clearBtn.onclick = clearAll;
generateBtn.onclick = () => generate(false);
regenerateBtn.onclick = () => generate(true);
downloadBtn.onclick = downloadResult;
saveLocalBtn.onclick = saveLocal;

openGalleryBtn.onclick = () => {
  renderGallery();
  galleryCard.style.display = "block";
};
closeGalleryBtn.onclick = () => (galleryCard.style.display = "none");
clearGalleryBtn.onclick = () => {
  localStorage.removeItem(storageKey());
  renderGallery();
};

uploadInput.onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  capturedBlob = file;
  const dataUrl = await blobToDataURL(file);
  previewImg.src = dataUrl;
  previewImg.style.display = "block";
  video.style.display = "none";
  updateGenerateAvailability();
  setStatus("Photo uploaded", "ok");
};

initConfig().then(() => {
  updateGenerateAvailability();
});