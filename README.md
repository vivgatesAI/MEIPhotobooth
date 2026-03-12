# MEI Photo Booth (Venice API)

iPhone-first web photo booth for Boston Medical Engagement & Impact events.

## Features
- Safari camera capture + photo upload
- Portrait/landscape-aware processing
- 6 presets with generated thumbnail art
- Venice image editing integration with strict likeness-preservation instructions
- Processing animations + smooth UX states
- Multi-model selector for Venice edit models
- Regenerate + softer-style toggle
- Download + local save + local gallery

## Venice edit models included
These are configured as user-selectable because they balance quality, reliability, and broad transformation coverage:
- `qwen-edit` (default, fast + versatile)
- `flux-2-max-edit` (high quality stylization)
- `gpt-image-1-5-edit` (strong general edits)
- `seedream-v4-edit` (creative fidelity)
- `nano-banana-pro-edit` (alternative style behavior)

## Local run
```bash
npm install
cp .env.example .env
npm run dev
```

## Railway Deployment
Deploy this repo directly.

### Required variables
- `VENICE_API_KEY`

### Recommended variables
- `VENICE_IMAGE_EDIT_MODEL=qwen-edit`
- `MAX_UPLOAD_MB=12`

### Optional variables
- `PORT` (Railway injects this automatically)
- `PUBLIC_BASE_URL`

## UX disclaimers
- Pre-camera permission consent block is shown before requesting camera access.
- Post-processing reminder is shown in footer.
- Explicit fallback for camera denial (upload path).

## Notes
- Local gallery data is browser/device specific (localStorage).
- For high-scale event usage, add persistent object storage + session backend.
