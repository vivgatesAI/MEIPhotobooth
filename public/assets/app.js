const welcomeView = document.getElementById("welcomeView");
const cameraView = document.getElementById("cameraView");
const previewView = document.getElementById("previewView");
const consentModal = document.getElementById("consentModal");

const startBtn = document.getElementById("startBtn");
const agreeConsentBtn = document.getElementById("agreeConsentBtn");
const cancelConsentBtn = document.getElementById("cancelConsentBtn");
const homeBtn = document.getElementById("homeBtn");

const video = document.getElementById("video");
const captureCanvas = document.getElementById("captureCanvas");
const previewImg = document.getElementById("previewImg");
const resultImg = document.getElementById("resultImg");

const captureBtn = document.getElementById("captureBtn");
const generateBtn = document.getElementById("generateBtn");
const retakeBtn = document.getElementById("retakeBtn");
const downloadBtn = document.getElementById("downloadBtn");

const uploadInput = document.getElementById("uploadInput");
const uploadFromWelcome = document.getElementById("uploadFromWelcome");

const presetGrid = document.getElementById("presetGrid");
const customPrompt = document.getElementById("customPrompt");
const progressWrap = document.getElementById("progressWrap");
const statusEl = document.getElementById("status");

let stream = null;
let sourceBlob = null;
let outputDataUrl = null;
let selectedPreset = "mei_massachusetts";
const presets = [
  { key: "mei_massachusetts", label: "MEI Skyline" },
  { key: "lobster_harbor", label: "Lobster Harbor" },
  { key: "retro_aquarium", label: "Retro Aquarium" },
  { key: "clinical_future", label: "Clinical Future" },
  { key: "beacon_night", label: "Beacon Night" },
  { key: "custom", label: "Custom" },
];

function setStatus(m) { statusEl.textContent = m || "Ready"; }
function show(v) {
  [welcomeView, cameraView, previewView].forEach((el) => el.classList.remove("active"));
  v.classList.add("active");
}

function renderPresets() {
  presetGrid.innerHTML = "";
  presets.forEach((p) => {
    const b = document.createElement("button");
    b.className = `preset-pill ${p.key === selectedPreset ? "active" : ""}`;
    b.textContent = p.label;
    b.onclick = () => {
      selectedPreset = p.key;
      customPrompt.style.display = p.key === "custom" ? "block" : "none";
      renderPresets();
    };
    presetGrid.appendChild(b);
  });
}

async function enableCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
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
  setStatus("Captured. Choose style and apply.");
}

async function setUploadAsSource(file) {
  const dataUrl = await readFileAsDataURL(file);
  sourceBlob = file;
  outputDataUrl = dataUrl;
  resultImg.src = dataUrl;
  show(previewView);
  setStatus("Uploaded. Choose style and apply.");
}

async function applyStyle() {
  if (!sourceBlob) return;
  progressWrap.classList.add("active");
  setStatus("Applying AI style...");
  const fd = new FormData();
  fd.append("image", sourceBlob, "input.jpg");
  fd.append("preset", selectedPreset);
  if (selectedPreset === "custom") fd.append("customPrompt", customPrompt.value || "");
  fd.append("aspectRatio", window.innerHeight > window.innerWidth ? "4:5" : "16:9");

  try {
    const resp = await fetch("/api/edit", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Edit failed");
    outputDataUrl = data.imageBase64;
    resultImg.src = outputDataUrl;
    setStatus("Style applied");
  } catch (e) {
    setStatus(e.message || "Error");
  } finally {
    progressWrap.classList.remove("active");
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
homeBtn.onclick = () => {
  stopCamera();
  show(welcomeView);
};
captureBtn.onclick = capturePhoto;
retakeBtn.onclick = async () => {
  if (stream) show(cameraView);
  else show(welcomeView);
};
generateBtn.onclick = applyStyle;
downloadBtn.onclick = downloadCurrent;

uploadInput.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) await setUploadAsSource(f);
};
uploadFromWelcome.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) await setUploadAsSource(f);
};

renderPresets();