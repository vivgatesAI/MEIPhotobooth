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
const galleryCard = document.getElementById("galleryCard");
const galleryGrid = document.getElementById("galleryGrid");
const openGalleryBtn = document.getElementById("openGalleryBtn");
const clearGalleryBtn = document.getElementById("clearGalleryBtn");

let selectedPreset = "mei_massachusetts";
let presets = [];
let capturedBlob = null;
let outputDataUrl = null;
let stream = null;

function setStatus(msg) { statusEl.textContent = msg || "Ready"; }
const key = () => "mei.photobooth.saved";
const getSaved = () => JSON.parse(localStorage.getItem(key()) || "[]");
const renderGallery = () => {
  const items = getSaved();
  galleryGrid.innerHTML = items.map(it => `<img src="${it.image}" alt="saved"/>`).join("");
};

function renderPresets() {
  presetGrid.innerHTML = "";
  presets.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `preset-pill ${p.key === selectedPreset ? "active" : ""}`;
    b.textContent = p.label;
    b.onclick = () => {
      selectedPreset = p.key;
      customPrompt.style.display = selectedPreset === "custom" ? "block" : "none";
      renderPresets();
    };
    presetGrid.appendChild(b);
  });
}

function updateAvailability() {
  const ok = !!capturedBlob;
  generateBtn.disabled = !ok;
  regenerateBtn.disabled = !ok;
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1920 } }, audio: false });
    video.srcObject = stream;
    video.style.display = "block";
    previewImg.style.display = "none";
    captureBtn.disabled = false;
    setStatus("Camera enabled");
  } catch {
    setStatus("Camera denied — use upload");
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
  captureCanvas.getContext("2d").drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
  const blob = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.95));
  capturedBlob = blob;
  previewImg.src = await blobToDataURL(blob);
  previewImg.style.display = "block";
  video.style.display = "none";
  updateAvailability();
  setStatus("Captured");
}

function resetAll() {
  capturedBlob = null;
  outputDataUrl = null;
  resultImg.style.display = "none";
  resultImg.src = "";
  previewImg.style.display = "none";
  if (stream) video.style.display = "block";
  downloadBtn.disabled = true;
  saveLocalBtn.disabled = true;
  updateAvailability();
  setStatus("Reset");
}

async function generate(regen = false) {
  if (!capturedBlob) return;
  progressWrap.classList.add("active");
  setStatus(regen ? "Regenerating…" : "Generating…");
  generateBtn.disabled = true;
  regenerateBtn.disabled = true;

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
    if (!resp.ok) throw new Error(data?.error || "Failed");
    outputDataUrl = data.imageBase64;
    resultImg.src = outputDataUrl;
    resultImg.style.display = "block";
    downloadBtn.disabled = false;
    saveLocalBtn.disabled = false;
    setStatus(`Done · ${data.modelUsed}`);
  } catch (e) {
    setStatus(e.message || "Error");
  } finally {
    progressWrap.classList.remove("active");
    updateAvailability();
  }
}

function downloadResult() {
  if (!outputDataUrl) return;
  const a = document.createElement("a");
  a.href = outputDataUrl;
  a.download = `mei-photobooth-${Date.now()}.png`;
  a.click();
}

function saveLocal() {
  if (!outputDataUrl) return;
  const arr = getSaved();
  arr.unshift({ id: Date.now(), image: outputDataUrl, preset: selectedPreset });
  localStorage.setItem(key(), JSON.stringify(arr.slice(0, 24)));
  renderGallery();
  setStatus("Saved locally");
}

async function init() {
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
  renderGallery();
}

startCameraBtn.onclick = startCamera;
captureBtn.onclick = captureFromVideo;
uploadInput.onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  capturedBlob = file;
  previewImg.src = await blobToDataURL(file);
  previewImg.style.display = "block";
  video.style.display = "none";
  updateAvailability();
  setStatus("Uploaded");
};
clearBtn.onclick = resetAll;
generateBtn.onclick = () => generate(false);
regenerateBtn.onclick = () => generate(true);
downloadBtn.onclick = downloadResult;
saveLocalBtn.onclick = saveLocal;
openGalleryBtn.onclick = () => {
  galleryCard.style.display = galleryCard.style.display === "none" ? "block" : "none";
  renderGallery();
};
clearGalleryBtn.onclick = () => {
  localStorage.removeItem(key());
  renderGallery();
};

init();