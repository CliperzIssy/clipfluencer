# Clipfluencer

AI video clipper: creators chat with their footage and get highlights cut automatically.

**Status:** built 2024–2026. It cut video production time by 80% across 500+ videos.

## What it does

- Transcribes footage with Whisper and AssemblyAI.
- Analyses video with Gemini and Google Video Intelligence.
- Uses GPT-5 as the clip director, which decides what gets cut.
- Renders clips with FFmpeg on Modal workers and stores files in Cloudflare R2.

## Where to look

| Path | What it holds |
|---|---|
| `app/api/analyze-v6/` | Latest clip analysis route; earlier versions sit beside it |
| `app/api/chat-gemini-video/` | Chat with your footage |
| `lib/geminiVideoBlueprint.ts` | Video analysis with Gemini |
| `lib/videoIntelligence.ts` | Google Video Intelligence |
| `modal_app/video_processor.py` | FFmpeg rendering on Modal |
| `components/ClipEditor.tsx` | Clip editor UI |

**Stack:** Next.js, OpenAI, Gemini, AssemblyAI, Google Cloud, FFmpeg, Modal, R2

This is a clean snapshot, so the original commit history, debugging notes and sample data are not included. Shared as a portfolio project; all rights reserved.
