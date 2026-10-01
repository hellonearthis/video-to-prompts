# Tooling: getting evidence out of a video file

Use these when a video file is available in the sandbox (for example under `/mnt/user-data/uploads`). Check that each tool exists before relying on it (`which ffmpeg ffprobe`). Network access may be restricted, so do not assume models or packages can be downloaded. If a step is unavailable, say so in the intake and mark the matching analysis as limited.

## 1. Metadata

```bash
ffprobe -v error -show_format -show_streams -of json input.mp4 > meta.json
```

Record duration, resolution, frame rate, aspect ratio, codecs, audio channels and sample rate, subtitle streams, creation and encoder tags. Note whether there is an audio stream at all.

## 2. Embedded subtitles

```bash
ffmpeg -i input.mp4 -map 0:s:0 subs.srt
```

If this works, treat the result as supplied captions: useful, but not proof of what is actually spoken.

## 3. Frames

Uniform sampling (every 2 seconds, small for quick scanning):

```bash
mkdir -p frames && ffmpeg -i input.mp4 -vf "fps=1/2,scale=640:-1" frames/u_%04d.jpg
```

Scene-change frames with timestamps (tune `0.3` between 0.2 and 0.5):

```bash
ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr frames/scene_%04d.jpg 2>&1 | grep showinfo
```

The `pts_time` values in the `showinfo` lines are the cut timestamps.

Contact sheet to scan overall structure first:

```bash
ffmpeg -i input.mp4 -vf "fps=1/5,scale=320:-1,tile=4x4" sheet_%02d.png
```

View sheets first for structure, then individual frames for detail. Add extra frames around ambiguous moments, text cards, and any cut.

Frame timestamp = frame index × sampling interval (for uniform sampling). Report precision as ±interval.

## 4. Audio

```bash
ffmpeg -i input.mp4 -vn -ac 1 -ar 16000 audio.wav
ffmpeg -i input.mp4 -af silencedetect=noise=-35dB:d=0.5 -f null - 2>&1 | grep silence
ffmpeg -i input.mp4 -af ebur128 -f null - 2>&1 | tail -n 20
```

Silence intervals and loudness give structural evidence (breaks, music stings, level jumps) even without a transcript.

## 5. Speech

If a transcription tool is installed (`which whisper faster-whisper`), run it on `audio.wav` with word or segment timestamps. If none is available, ask the user for a transcript or captions, or state that speech content cannot be confirmed. Never fill in dialogue from guesses.

## 6. Long videos

Split into chunks (for example 2-5 minutes), analyze each, then merge:

```bash
ffmpeg -i input.mp4 -c copy -f segment -segment_time 180 -reset_timestamps 1 chunk_%03d.mp4
```

Keep a running map of chunk offsets so merged timestamps refer to the original video.

## 7. What to report from tooling

State in the intake: which extractions succeeded, sampling interval, whether audio and speech were analyzed, and any gaps. Tool output is evidence about the file; it is not evidence about intent.
