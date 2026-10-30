# Modal Video Processor

This directory contains the Modal app for background video processing.

## Setup

1. Install Modal CLI:
```bash
pip install modal
```

2. Authenticate with Modal:
```bash
modal token set --token-id $MODAL_TOKEN_ID --token-secret $MODAL_TOKEN_SECRET
```

3. Deploy the app:
```bash
modal deploy video_processor.py
```

## What it does

- Accepts video processing requests via webhook
- Downloads videos from R2
- Generates proxy videos (480p) for fast editing
- Generates thumbnails (1 per second)
- Uploads processed files back to R2
- Returns metadata and file locations

## Environment Variables Needed

The Modal app needs these secrets (configured in Modal dashboard or via CLI):
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ASSEMBLYAI_API_KEY` (optional, for transcription)
