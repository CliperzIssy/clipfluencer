"""
Modal app for video processing - handles all heavy compute tasks
This runs in Modal's cloud infrastructure, eliminating timeout issues

Includes:
- Video processing (proxy, thumbnails)
- Clip rendering with FFmpeg (9:16 conversion, captions, multi-scene)
"""

import modal
import os
from pathlib import Path
from typing import Optional, List

# Create Modal app
app = modal.App("clipfluencer-video-processor")

# Define the image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "ffmpeg",
        "libavcodec-extra",
        "libavformat-dev",
        "libavutil-dev",
        "libswscale-dev",
        "fonts-dejavu-core",  # Fallback fonts for captions
    )
    .pip_install(
        "boto3",  # For R2 access (S3-compatible)
        "assemblyai",  # For transcription
        "openai",  # For GPT analysis
        "google-generativeai",  # For Gemini analysis
        "requests",  # For HTTP requests
        "fastapi",  # Required for web endpoints
    )
)

# Mount secrets from Modal
secrets = [modal.Secret.from_name("clipfluencer-secrets")]

# ========================================
# CONSTANTS FOR 9:16 CLIP RENDERING
# ========================================
TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920
R2_PUBLIC_URL = 'https://pub-2ae315c752e74a34be839fc681f792d8.r2.dev'

# ASS Caption Styles (TikTok/Reels/Shorts optimized)
KARAOKE_STYLES = {
    'bold-center': 'Style: Default,Arial Black,80,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,2,0,1,5,3,2,50,50,200,1',
    'highlight': 'Style: Default,Impact,85,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,2,0,1,6,3,2,50,50,200,1',
    'minimal': 'Style: Default,Arial,65,&H00FFFFFF,&H00FFCC00,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,2,2,50,50,220,1',
    'outline': 'Style: Default,Arial Black,75,&H00FFFFFF,&H000099FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,4,2,50,50,200,1',
}
TITLE_STYLE = 'Style: Title,Arial Black,70,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,8,50,50,300,1'


# ========================================
# ASS SUBTITLE GENERATION FUNCTIONS
# ========================================

def format_ass_time(seconds: float) -> str:
    """Convert seconds to ASS time format: H:MM:SS.CC"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centiseconds = int((seconds % 1) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"


def get_karaoke_style(style: str) -> str:
    """Get ASS style string for caption style"""
    return KARAOKE_STYLES.get(style, KARAOKE_STYLES['bold-center'])


def extract_words_for_time_range(
    transcript: dict,
    start_time: float,
    end_time: float
) -> List[dict]:
    """Extract words from transcript for a single scene, adjusting timestamps"""
    if not transcript or 'words' not in transcript:
        return []

    words = []
    for w in transcript['words']:
        word_start = w.get('start', 0)
        word_end = w.get('end', 0)
        if word_start >= start_time and word_end <= end_time:
            words.append({
                'word': w.get('word', ''),
                'start': word_start - start_time,  # Relative to clip start
                'end': word_end - start_time,
            })
    return words


def extract_words_for_multi_scene(
    transcript: dict,
    scenes: List[dict]
) -> List[dict]:
    """Extract words for multi-scene clips, adjusting for concatenated timeline"""
    if not transcript or 'words' not in transcript:
        return []

    all_words = []
    cumulative_time = 0.0

    for scene in scenes:
        scene_start = scene.get('startTime', scene.get('start', 0))
        scene_end = scene.get('endTime', scene.get('end', 0))
        scene_duration = scene_end - scene_start

        # Extract words for this scene
        for w in transcript['words']:
            word_start = w.get('start', 0)
            word_end = w.get('end', 0)
            if word_start >= scene_start and word_end <= scene_end:
                all_words.append({
                    'word': w.get('word', ''),
                    'start': word_start - scene_start + cumulative_time,
                    'end': word_end - scene_start + cumulative_time,
                })

        cumulative_time += scene_duration

    return all_words


def create_subtitle_file_with_word_timing(
    words: List[dict],
    output_path: str,
    style: str = 'bold-center',
    title: str = '',
    clip_duration: float = 0
) -> Optional[str]:
    """Create ASS subtitle file with karaoke-style word highlighting"""
    if not words:
        return None

    style_config = get_karaoke_style(style)

    # ASS header
    ass_content = f"""[Script Info]
Title: Karaoke Captions
ScriptType: v4.00+
PlayResX: {TARGET_WIDTH}
PlayResY: {TARGET_HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_config}
{TITLE_STYLE}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # Add title if provided (visible for entire clip)
    if title and clip_duration > 0:
        title_start = format_ass_time(0)
        title_end = format_ass_time(clip_duration)
        escaped_title = title.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}')
        ass_content += f"Dialogue: 1,{title_start},{title_end},Title,,0,0,0,,{escaped_title}\n"

    # Group words into 3-word chunks for readability
    words_per_line = 3

    for i in range(0, len(words), words_per_line):
        line_words = words[i:min(i + words_per_line, len(words))]
        line_start = line_words[0]['start']
        line_end = line_words[-1]['end']

        # Add buffer for gap handling
        next_line_start = words[i + words_per_line]['start'] if i + words_per_line < len(words) else line_end + 1
        gap = next_line_start - line_end
        if gap > 0.5:
            line_end = line_end + 0.3
        else:
            line_end = line_end + 0.1

        # Build karaoke text with {\k} tags
        karaoke_text = ''
        for j, word in enumerate(line_words):
            duration = max(0.1, word['end'] - word['start'])
            centiseconds = max(10, round(duration * 100))
            karaoke_text += f"{{\\k{centiseconds}}}{word['word']}"
            if j < len(line_words) - 1:
                karaoke_text += ' '

        start_str = format_ass_time(line_start)
        end_str = format_ass_time(line_end)
        ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{karaoke_text}\n"

    # Write file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(ass_content)

    return output_path


def create_subtitle_file_from_text(
    text: str,
    duration: float,
    output_path: str,
    style: str = 'bold-center',
    title: str = ''
) -> Optional[str]:
    """Create ASS subtitle from custom text (evenly distributed timing)"""
    if not text or style == 'none':
        return None

    words = text.split()
    if not words:
        return None

    style_config = get_karaoke_style(style)

    ass_content = f"""[Script Info]
Title: Captions
ScriptType: v4.00+
PlayResX: {TARGET_WIDTH}
PlayResY: {TARGET_HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_config}
{TITLE_STYLE}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # Add title
    if title and duration > 0:
        title_start = format_ass_time(0)
        title_end = format_ass_time(duration)
        escaped_title = title.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}')
        ass_content += f"Dialogue: 1,{title_start},{title_end},Title,,0,0,0,,{escaped_title}\n"

    # Create chunks of 2 words
    words_per_chunk = 2
    chunks = []
    for i in range(0, len(words), words_per_chunk):
        chunks.append(' '.join(words[i:i + words_per_chunk]))

    time_per_chunk = duration / len(chunks)

    for i, chunk in enumerate(chunks):
        chunk_start = i * time_per_chunk
        chunk_end = (i + 1) * time_per_chunk + 0.1  # Small buffer

        start_str = format_ass_time(chunk_start)
        end_str = format_ass_time(chunk_end)
        ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{chunk}\n"

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(ass_content)

    return output_path


# ========================================
# FFMPEG FILTER FUNCTIONS
# ========================================

def get_9x16_conversion_filter(
    crop_style: str,
    input_label: str,
    output_label: str
) -> str:
    """Generate FFmpeg filter for 9:16 aspect ratio conversion"""
    if crop_style == 'blur-bars':
        # Instagram style: blurred background with centered content
        return (
            f"[{input_label}]split=2[bg][fg];"
            f"[bg]scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=increase,"
            f"crop={TARGET_WIDTH}:{TARGET_HEIGHT},boxblur=30[blurred];"
            f"[fg]scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease[scaled];"
            f"[blurred][scaled]overlay=(W-w)/2:(H-h)/2[{output_label}]"
        )
    else:
        # Center crop (default): fill and crop
        return (
            f"[{input_label}]scale={TARGET_WIDTH}:{TARGET_HEIGHT}:"
            f"force_original_aspect_ratio=increase,"
            f"crop={TARGET_WIDTH}:{TARGET_HEIGHT}[{output_label}]"
        )


@app.function(
    image=image,
    secrets=secrets,
    timeout=3600,  # 1 hour timeout
    memory=4096,  # 4GB RAM
)
def process_video(video_url: str, video_key: str) -> dict:
    """
    Main video processing function

    Steps:
    1. Download video from R2
    2. Generate proxy video (low-res for editing)
    3. Generate thumbnails
    4. Transcribe with AssemblyAI
    5. Analyze with Gemini/GPT
    6. Upload processed files back to R2
    7. Return metadata
    """
    import boto3
    import subprocess
    import tempfile

    print(f"🎬 Starting video processing for: {video_key}")

    # Initialize R2 client
    s3_client = boto3.client(
        's3',
        endpoint_url=os.environ['R2_ENDPOINT'],
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto',
    )

    bucket_name = os.environ['R2_BUCKET_NAME']

    # Create temp directory for processing
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Step 1: Download video from R2
        print("📥 Downloading video from R2...")
        original_video = temp_path / "original.mp4"
        s3_client.download_file(bucket_name, video_key, str(original_video))
        print(f"✓ Downloaded: {original_video.stat().st_size / 1024 / 1024:.2f}MB")

        # Step 2: Generate proxy video (480p for fast editing)
        print("🎞️  Generating proxy video...")
        proxy_video = temp_path / "proxy.mp4"
        proxy_cmd = [
            "ffmpeg", "-i", str(original_video),
            "-vf", "scale=-2:480",  # 480p height, maintain aspect ratio
            "-c:v", "libx264",
            "-crf", "28",
            "-preset", "fast",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            str(proxy_video),
            "-y"
        ]
        subprocess.run(proxy_cmd, check=True, capture_output=True)
        print(f"✓ Proxy created: {proxy_video.stat().st_size / 1024 / 1024:.2f}MB")

        # Step 3: Generate thumbnails (every 1 second)
        print("📸 Generating thumbnails...")
        thumb_dir = temp_path / "thumbnails"
        thumb_dir.mkdir()
        thumb_cmd = [
            "ffmpeg", "-i", str(original_video),
            "-vf", "fps=1,scale=-2:120",  # 1 frame per second, 120p height
            "-q:v", "5",
            str(thumb_dir / "thumb_%04d.jpg"),
            "-y"
        ]
        subprocess.run(thumb_cmd, check=True, capture_output=True)
        thumbnails = sorted(thumb_dir.glob("*.jpg"))
        print(f"✓ Generated {len(thumbnails)} thumbnails")

        # Step 4: Upload proxy and thumbnails to R2
        print("☁️  Uploading processed files to R2...")

        # Upload proxy
        proxy_key = video_key.replace("uploads/", "proxies/")
        s3_client.upload_file(
            str(proxy_video),
            bucket_name,
            proxy_key,
            ExtraArgs={'ContentType': 'video/mp4'}
        )
        print(f"✓ Proxy uploaded: {proxy_key}")

        # Upload thumbnails
        thumbnail_keys = []
        for i, thumb in enumerate(thumbnails):
            thumb_key = video_key.replace("uploads/", f"thumbnails/").replace(".mp4", f"/thumb_{i:04d}.jpg")
            s3_client.upload_file(
                str(thumb),
                bucket_name,
                thumb_key,
                ExtraArgs={'ContentType': 'image/jpeg'}
            )
            thumbnail_keys.append(thumb_key)
        print(f"✓ Uploaded {len(thumbnail_keys)} thumbnails")

        # Step 5: Get video metadata
        print("📊 Extracting video metadata...")
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration,size",
            "-show_entries", "stream=width,height,codec_name",
            "-of", "json",
            str(original_video)
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)

        # Parse video duration for thumbnail metadata
        import json
        metadata = json.loads(probe_result.stdout)
        video_duration = float(metadata.get('format', {}).get('duration', 0))

        # Generate thumbnail pattern URL for client
        # Extract video ID from video_key (e.g., "uploads/1234567890-video.mp4" -> "1234567890-video")
        video_id = video_key.replace("uploads/", "").replace(".mp4", "")

        # Construct thumbnail pattern
        # Pattern: thumbnails/{video_id}/thumb_{####}.jpg
        # Client can replace {####} with frame number (0001, 0002, etc.)
        thumbnail_pattern = f"thumbnails/{video_id}/thumb_{{{{####}}}}.jpg"

        # Get R2 public URL from environment (with hardcoded fallback)
        # This is the public URL for the R2 bucket
        r2_public_url = 'https://pub-2ae315c752e74a34be839fc681f792d8.r2.dev'
        thumbnail_pattern_url = f"{r2_public_url}/{thumbnail_pattern}"

        # TODO: Add transcription with AssemblyAI
        # TODO: Add AI analysis with Gemini/GPT

        print("✅ Video processing complete!")
        print(f"   Duration: {video_duration:.2f}s")
        print(f"   Thumbnails: {len(thumbnail_keys)} frames")
        print(f"   Pattern: {thumbnail_pattern_url}")

        return {
            "success": True,
            "original_key": video_key,
            "proxy_key": proxy_key,
            "thumbnail_keys": thumbnail_keys,
            "thumbnail_pattern": thumbnail_pattern_url,
            "thumbnail_count": len(thumbnail_keys),
            "video_duration": video_duration,
            "metadata": probe_result.stdout,
            "message": "Video processed successfully"
        }


@app.function(image=image)
def health_check() -> dict:
    """Simple health check endpoint"""
    return {"status": "healthy", "service": "clipfluencer-video-processor"}


# ========================================
# CLIP RENDERING FUNCTION
# ========================================

@app.function(
    image=image,
    secrets=secrets,
    timeout=3600,  # 1 hour timeout for long clips
    memory=4096,   # 4GB RAM
)
def render_clip(
    video_key: str,
    start_time: float,
    end_time: float,
    clip_number: int,
    caption_style: str = 'none',
    custom_caption_text: str = None,
    transcript: dict = None,
    clip_type: str = 'single-scene',
    scenes: list = None,
    crop_style: str = 'center-crop',
    title: str = None
) -> dict:
    """
    Render a clip with 9:16 conversion and optional captions.

    This function handles:
    - Single-scene clips (trim + convert)
    - Multi-scene clips (trim each + concat + convert)
    - Karaoke-style captions with word-level timing
    - 9:16 aspect ratio conversion (center-crop or blur-bars)
    - Title overlays
    """
    import boto3
    import subprocess
    import tempfile
    import time

    print(f"🎬 Starting clip render: clip-{clip_number}")
    print(f"   Type: {clip_type}")
    print(f"   Time: {start_time}s - {end_time}s")
    print(f"   Caption style: {caption_style}")
    print(f"   Crop style: {crop_style}")

    # Initialize R2 client
    s3_client = boto3.client(
        's3',
        endpoint_url=os.environ['R2_ENDPOINT'],
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto',
    )
    bucket_name = os.environ['R2_BUCKET_NAME']

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Step 1: Download video from R2
        print("📥 Downloading video from R2...")
        input_video = temp_path / "input.mp4"
        s3_client.download_file(bucket_name, video_key, str(input_video))
        print(f"   ✓ Downloaded: {input_video.stat().st_size / 1024 / 1024:.2f}MB")

        # Step 2: Calculate clip duration
        if clip_type == 'multi-scene' and scenes and len(scenes) > 1:
            # Filter valid scenes
            valid_scenes = [s for s in scenes if (s.get('endTime', s.get('end', 0)) - s.get('startTime', s.get('start', 0))) > 0]
            clip_duration = sum(
                (s.get('endTime', s.get('end', 0)) - s.get('startTime', s.get('start', 0)))
                for s in valid_scenes
            )
            print(f"   Multi-scene: {len(valid_scenes)} scenes, {clip_duration:.1f}s total")
        else:
            clip_duration = end_time - start_time
            valid_scenes = None
            print(f"   Single-scene: {clip_duration:.1f}s")

        # Step 3: Generate subtitle file
        ass_path = None
        if caption_style and caption_style != 'none':
            print("📝 Generating captions...")
            ass_file = temp_path / "subtitle.ass"

            if custom_caption_text:
                # Use custom text with even timing
                ass_path = create_subtitle_file_from_text(
                    custom_caption_text,
                    clip_duration,
                    str(ass_file),
                    caption_style,
                    title or ''
                )
            elif transcript and transcript.get('words'):
                # Use word-level timing for perfect sync
                if clip_type == 'multi-scene' and valid_scenes:
                    words = extract_words_for_multi_scene(transcript, valid_scenes)
                else:
                    words = extract_words_for_time_range(transcript, start_time, end_time)

                if words:
                    ass_path = create_subtitle_file_with_word_timing(
                        words,
                        str(ass_file),
                        caption_style,
                        title or '',
                        clip_duration
                    )
                    print(f"   ✓ Created karaoke captions with {len(words)} words")

            if ass_path:
                print(f"   ✓ Subtitle file created")

        # Step 4: Build FFmpeg command
        print("🎬 Building FFmpeg filter chain...")
        output_video = temp_path / f"clip-{clip_number}-{int(time.time())}.mp4"

        if clip_type == 'multi-scene' and valid_scenes and len(valid_scenes) > 1:
            # Multi-scene: trim each, concat, then convert
            filter_parts = []
            concat_inputs = []

            for i, scene in enumerate(valid_scenes):
                scene_start = scene.get('startTime', scene.get('start', 0))
                scene_end = scene.get('endTime', scene.get('end', 0))

                # Trim video
                filter_parts.append(
                    f"[0:v]trim=start={scene_start}:end={scene_end},setpts=PTS-STARTPTS[v{i}]"
                )
                # Trim audio
                filter_parts.append(
                    f"[0:a]atrim=start={scene_start}:end={scene_end},asetpts=PTS-STARTPTS[a{i}]"
                )
                concat_inputs.append(f"[v{i}][a{i}]")

            # Concatenate all scenes
            filter_parts.append(
                f"{''.join(concat_inputs)}concat=n={len(valid_scenes)}:v=1:a=1[concatv][outa]"
            )

            # Apply 9:16 conversion
            aspect_filter = get_9x16_conversion_filter(crop_style, 'concatv', 'vout')
            filter_parts.append(aspect_filter)

            # Add subtitles if needed
            if ass_path and caption_style != 'none':
                escaped_path = str(ass_path).replace(':', '\\:')
                filter_parts.append(f"[vout]ass='{escaped_path}'[vfinal]")
                video_map = '[vfinal]'
            else:
                video_map = '[vout]'

            audio_map = '[outa]'

        else:
            # Single-scene: trim, convert, add captions
            filter_parts = []

            # Trim video and audio
            filter_parts.append(
                f"[0:v]trim=start={start_time}:end={end_time},setpts=PTS-STARTPTS[vtrim]"
            )
            filter_parts.append(
                f"[0:a]atrim=start={start_time}:end={end_time},asetpts=PTS-STARTPTS[atrim]"
            )

            # Apply 9:16 conversion
            aspect_filter = get_9x16_conversion_filter(crop_style, 'vtrim', 'vout')
            filter_parts.append(aspect_filter)

            # Add subtitles if needed
            if ass_path and caption_style != 'none':
                escaped_path = str(ass_path).replace(':', '\\:')
                filter_parts.append(f"[vout]ass='{escaped_path}'[vfinal]")
                video_map = '[vfinal]'
            else:
                video_map = '[vout]'

            audio_map = '[atrim]'

        filter_complex = ';'.join(filter_parts)
        print(f"   Filter chain built ({len(filter_parts)} filters)")

        # Step 5: Run FFmpeg
        print("🔧 Running FFmpeg...")
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', str(input_video),
            '-filter_complex', filter_complex,
            '-map', video_map,
            '-map', audio_map,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            str(output_video),
            '-y'
        ]

        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print(f"❌ FFmpeg error: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr}")

        print(f"   ✓ Rendered: {output_video.stat().st_size / 1024 / 1024:.2f}MB")

        # Step 6: Upload to R2
        print("☁️  Uploading to R2...")

        # Generate output key
        video_id = video_key.replace("uploads/", "").replace(".mp4", "")
        output_key = f"clips/{video_id}/clip-{clip_number}-{int(time.time())}.mp4"

        s3_client.upload_file(
            str(output_video),
            bucket_name,
            output_key,
            ExtraArgs={'ContentType': 'video/mp4'}
        )

        clip_url = f"{R2_PUBLIC_URL}/{output_key}"
        print(f"   ✓ Uploaded: {clip_url}")

        print("✅ Clip render complete!")

        return {
            "success": True,
            "clip_url": clip_url,
            "output_key": output_key,
            "filename": output_key.split('/')[-1],
            "duration": clip_duration,
            "clip_number": clip_number,
        }


# ========================================
# WEB ENDPOINTS
# ========================================

@app.function(image=image, secrets=secrets)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
    from typing import Optional, List

    class ProcessVideoRequest(BaseModel):
        video_url: str
        video_key: str

    class RenderClipRequest(BaseModel):
        video_url: str
        video_key: str
        start_time: float
        end_time: float
        clip_number: int
        caption_style: str = 'none'
        custom_caption_text: Optional[str] = None
        transcript: Optional[dict] = None
        clip_type: str = 'single-scene'
        scenes: Optional[List[dict]] = None
        crop_style: str = 'center-crop'
        title: Optional[str] = None

    web_app = FastAPI(title="Clipfluencer Video Processor")

    @web_app.get("/health")
    async def health():
        return {"status": "healthy", "service": "clipfluencer-video-processor"}

    @web_app.post("/process")
    async def trigger_processing(request: ProcessVideoRequest):
        """
        Process a video (generate proxy, thumbnails, etc.)

        POST body:
        {
            "video_url": "https://pub-xxx.r2.dev/uploads/xxxxx.mp4",
            "video_key": "uploads/xxxxx.mp4"
        }
        """
        print(f"🚀 Triggering video processing: {request.video_key}")
        result = process_video.remote(request.video_url, request.video_key)
        return result

    @web_app.post("/render-clip")
    async def trigger_render_clip(request: RenderClipRequest):
        """
        Render a clip with 9:16 conversion and captions.

        POST body:
        {
            "video_url": "https://pub-xxx.r2.dev/uploads/xxxxx.mp4",
            "video_key": "uploads/xxxxx.mp4",
            "start_time": 10.5,
            "end_time": 25.0,
            "clip_number": 1,
            "caption_style": "bold-center",
            "transcript": {"words": [...]},
            "clip_type": "single-scene",
            "crop_style": "center-crop",
            "title": "Optional Title"
        }
        """
        print(f"🎬 Triggering clip render: clip-{request.clip_number}")
        print(f"   Video: {request.video_key}")
        print(f"   Time: {request.start_time}s - {request.end_time}s")

        try:
            result = render_clip.remote(
                video_key=request.video_key,
                start_time=request.start_time,
                end_time=request.end_time,
                clip_number=request.clip_number,
                caption_style=request.caption_style,
                custom_caption_text=request.custom_caption_text,
                transcript=request.transcript,
                clip_type=request.clip_type,
                scenes=request.scenes,
                crop_style=request.crop_style,
                title=request.title,
            )
            return result
        except Exception as e:
            print(f"❌ Render failed: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    return web_app
