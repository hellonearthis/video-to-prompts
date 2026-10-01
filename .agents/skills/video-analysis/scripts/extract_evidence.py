#!/usr/bin/env python3
"""Extract inspectable evidence from a video or audio file.

Writes frames, scene-change frames, contact sheets, audio, silence/loudness
measurements, and embedded subtitles into an output folder, plus a
manifest.json whose "intake" block follows references/segment-schema.json.

It does NOT interpret the media and does NOT transcribe speech. Every step
records ok / failed / skipped in the manifest so that gaps stay visible.

Usage:
    python3 extract_evidence.py INPUT [--out DIR] [--interval SEC]
        [--max-frames N] [--scene-threshold 0.3] [--max-scenes N]
        [--start SEC --length SEC]

Exit codes: 0 = manifest written, 2 = fatal (missing tool, unreadable input).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

LONG_VIDEO_S = 600.0


def run(cmd: list[str], timeout: int = 900) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except OSError as exc:
        return 127, "", str(exc)
    return p.returncode, p.stdout, p.stderr


def frac(text: str | None) -> float | None:
    if not text or text in ("0/0", "N/A"):
        return None
    try:
        if "/" in text:
            n, d = text.split("/", 1)
            return float(n) / float(d) if float(d) else None
        return float(text)
    except ValueError:
        return None


def fmt_num(x: float) -> float:
    return round(x, 3)


class Manifest:
    def __init__(self) -> None:
        self.intake: dict = {
            "basis": "sampled_frames",
            "sampling_interval_s": None,
            "timestamp_precision_s": None,
            "duration_s": None,
            "has_audio": None,
            "speech_analyzed": False,
            "technical": {},
            "limitations": [],
        }
        self.steps: dict[str, dict] = {}
        self.files: dict = {}
        self.window: dict | None = None
        self.measurements: dict = {}

    def step(self, name: str, status: str, detail: str = "") -> None:
        self.steps[name] = {"status": status, "detail": detail}

    def limit(self, text: str) -> None:
        if text not in self.intake["limitations"]:
            self.intake["limitations"].append(text)

    def as_dict(self, source: str) -> dict:
        return {
            "source": source,
            "intake": self.intake,
            "window": self.window,
            "steps": self.steps,
            "files": self.files,
            "measurements": self.measurements,
        }


def probe(path: Path) -> dict | None:
    rc, out, _ = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)], 120)
    if rc != 0:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return None


def describe_streams(info: dict, m: Manifest) -> tuple[dict | None, list, list]:
    streams = info.get("streams", [])
    video = None
    for s in streams:
        if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic"):
            video = s
            break
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    subs = [s for s in streams if s.get("codec_type") == "subtitle"]

    fmt = info.get("format", {})
    duration = frac(fmt.get("duration")) or (frac(video.get("duration")) if video else None)
    m.intake["duration_s"] = fmt_num(duration) if duration else None
    m.intake["has_audio"] = bool(audio)

    tech: dict = {}
    codecs: list[str] = []
    if video:
        w, h = video.get("width"), video.get("height")
        if w and h:
            tech["resolution"] = f"{w}x{h}"
            g = math.gcd(int(w), int(h))
            tech["aspect_ratio"] = video.get("display_aspect_ratio") or f"{w // g}:{h // g}"
        avg, r = frac(video.get("avg_frame_rate")), frac(video.get("r_frame_rate"))
        rate = avg or r
        if rate:
            tech["frame_rate"] = f"{rate:.3f}".rstrip("0").rstrip(".")
        if avg and r and abs(avg - r) / max(avg, r) > 0.01:
            m.limit("Frame rate appears variable; frame-index-to-time conversion is unreliable, so use reported timestamps.")
        codecs.append(f"video:{video.get('codec_name')}")
    for a in audio:
        codecs.append(f"audio:{a.get('codec_name')}")
        tech.setdefault("audio_channels", a.get("channels"))
        tech.setdefault("audio_sample_rate", a.get("sample_rate"))
    for s in subs:
        codecs.append(f"subtitle:{s.get('codec_name')}")
    tech["codecs"] = codecs
    tags = {k: v for k, v in (fmt.get("tags") or {}).items() if k.lower() in ("creation_time", "encoder", "title", "comment")}
    if tags:
        tech["metadata_tags"] = tags
    m.intake["technical"] = tech
    m.step("probe", "ok", f"{len(audio)} audio, {len(subs)} subtitle stream(s)")
    return video, audio, subs


def parse_showinfo(stderr: str) -> list[float]:
    return [float(x) for x in re.findall(r"pts_time:\s*(-?[\d.]+)", stderr)]


def ffmpeg_frames(inopts: list[str], src: Path, vf: str, outpattern: Path, limit: int) -> tuple[int, str]:
    base = ["ffmpeg", "-hide_banner", "-nostdin", "-y", *inopts, "-i", str(src), "-an", "-vf", vf]
    tail = ["-frames:v", str(limit), "-q:v", "3", str(outpattern)]
    rc, _, err = run([*base, "-fps_mode", "vfr", *tail])
    if rc != 0 and "fps_mode" in err:
        rc, _, err = run([*base, "-vsync", "vfr", *tail])
    return rc, err


def clear(folder: Path, pattern: str) -> None:
    for f in folder.glob(pattern):
        f.unlink()


def extract_uniform(inopts, src, out, interval, max_frames, offset, m: Manifest) -> None:
    folder = out / "frames"
    folder.mkdir(exist_ok=True)
    clear(folder, "u_*.jpg")
    rc, err = ffmpeg_frames(inopts, src, f"fps=1/{interval},showinfo,scale=640:-2", folder / "u_%04d.jpg", max_frames)
    files = sorted(folder.glob("u_*.jpg"))
    if rc != 0 or not files:
        m.step("uniform_frames", "failed", err.strip().splitlines()[-1] if err.strip() else "no frames produced")
        m.limit("No uniform frames could be extracted.")
        return
    times = parse_showinfo(err)
    if len(times) < len(files):
        times = [i * interval for i in range(len(files))]
        m.limit("Frame times were computed from the sampling interval, not read from the decoder.")
    m.files["uniform_frames"] = [
        {"file": str(f.relative_to(out)), "time_s": fmt_num(offset + t)} for f, t in zip(files, times)
    ]
    m.step("uniform_frames", "ok", f"{len(files)} frames, interval {interval}s")


def extract_scenes(inopts, src, out, threshold, max_scenes, offset, m: Manifest) -> None:
    folder = out / "frames"
    folder.mkdir(exist_ok=True)
    clear(folder, "scene_*.jpg")
    vf = f"select='gt(scene,{threshold})',showinfo,scale=640:-2"
    rc, err = ffmpeg_frames(inopts, src, vf, folder / "scene_%04d.jpg", max_scenes + 1)
    files = sorted(folder.glob("scene_*.jpg"))
    if rc != 0:
        m.step("scene_changes", "failed", err.strip().splitlines()[-1] if err.strip() else "ffmpeg error")
        m.limit("Scene-change detection failed; cut times are unknown.")
        return
    times = parse_showinfo(err)[: len(files)]
    truncated = len(files) > max_scenes
    if truncated:
        files, times = files[:max_scenes], times[:max_scenes]
        for extra in sorted(folder.glob("scene_*.jpg"))[max_scenes:]:
            extra.unlink()
        m.limit(f"Scene-change output capped at {max_scenes} cuts; later cuts were not extracted.")
    m.files["scene_frames"] = [
        {"file": str(f.relative_to(out)), "cut_time_s": fmt_num(offset + t)} for f, t in zip(files, times)
    ]
    m.measurements["scene_threshold"] = threshold
    m.step("scene_changes", "ok", f"{len(files)} cut(s) at threshold {threshold}" + (" (capped)" if truncated else ""))
    m.limit("Scene detection is heuristic: zero or few detected cuts does not prove the video has none (gradual changes and fast motion are easy to miss or over-detect).")


def extract_sheets(inopts, src, out, eff_duration, offset, m: Manifest) -> None:
    folder = out / "sheets"
    folder.mkdir(exist_ok=True)
    clear(folder, "sheet_*.png")
    interval = max(1.0, round((eff_duration or 32.0) / 32.0 * 2) / 2)
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-y", *inopts, "-i", str(src), "-an",
           "-vf", f"fps=1/{interval},scale=320:-2,tile=4x4", str(folder / "sheet_%02d.png")]
    rc, _, err = run(cmd)
    files = sorted(folder.glob("sheet_*.png"))
    if rc != 0 or not files:
        m.step("contact_sheets", "failed", err.strip().splitlines()[-1] if err.strip() else "no sheets produced")
        return
    m.files["contact_sheets"] = {
        "files": [str(f.relative_to(out)) for f in files],
        "cells_per_sheet": 16,
        "layout": "4x4, row-major",
        "cell_interval_s": interval,
        "first_cell_time_s": fmt_num(offset),
        "note": "Cell k of the whole series is at about first_cell_time_s + k * cell_interval_s. The last sheet may contain empty cells.",
    }
    m.step("contact_sheets", "ok", f"{len(files)} sheet(s), one cell per {interval}s")


def extract_subtitles(src, out, subs, m: Manifest) -> None:
    if not subs:
        m.step("subtitles", "skipped", "no subtitle streams")
        return
    folder = out / "subtitles"
    folder.mkdir(exist_ok=True)
    results, ok = [], 0
    for i, _ in enumerate(subs):
        target = folder / f"subs_{i}.srt"
        rc, _, err = run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(src), "-map", f"0:s:{i}", str(target)])
        if rc == 0 and target.exists():
            cues = len(re.findall(r"-->", target.read_text(encoding="utf-8", errors="replace")))
            results.append({"stream": i, "file": str(target.relative_to(out)), "cues": cues})
            ok += 1
        else:
            results.append({"stream": i, "error": (err.strip().splitlines() or ["failed"])[-1]})
    m.files["subtitles"] = results
    m.step("subtitles", "ok" if ok else "failed", f"{ok}/{len(subs)} stream(s) extracted")
    if ok:
        m.limit("Embedded subtitles are supplied text, not proof of what is actually spoken.")
    if ok < len(subs):
        m.limit("Some subtitle streams could not be extracted (image-based subtitles cannot be converted to text).")


def extract_audio(inopts, src, out, offset, eff_duration, m: Manifest) -> None:
    wav = out / "audio.wav"
    rc, _, err = run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *inopts, "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    if rc != 0 or not wav.exists():
        m.step("audio", "failed", err.strip().splitlines()[-1] if err.strip() else "ffmpeg error")
        m.limit("Audio extraction failed.")
        return
    m.files["audio"] = str(wav.relative_to(out))
    rc, _, err = run(["ffmpeg", "-hide_banner", "-nostdin", "-nostats", *inopts, "-i", str(src), "-vn",
                      "-af", "silencedetect=noise=-35dB:d=0.5,ebur128=framelog=quiet", "-f", "null", "-"])
    silences, start = [], None
    for line in err.splitlines():
        a = re.search(r"silence_start:\s*(-?[\d.]+)", line)
        b = re.search(r"silence_end:\s*(-?[\d.]+)", line)
        if a:
            start = max(0.0, float(a.group(1)))
        if b and start is not None:
            silences.append({"start_s": fmt_num(offset + start), "end_s": fmt_num(offset + float(b.group(1)))})
            start = None
    if start is not None:
        end = eff_duration if eff_duration else start
        silences.append({"start_s": fmt_num(offset + start), "end_s": fmt_num(offset + end)})
    integrated = re.findall(r"\bI:\s+(-?inf|-?[\d.]+)\s+LUFS", err)
    lra = re.findall(r"\bLRA:\s+(-?inf|-?[\d.]+)\s+LU\b", err)
    m.measurements["silences"] = silences
    m.measurements["silence_params"] = {"noise_db": -35, "min_duration_s": 0.5}
    if integrated:
        try:
            m.measurements["integrated_loudness_lufs"] = float(integrated[-1])
        except ValueError:
            pass
    if lra:
        try:
            m.measurements["loudness_range_lu"] = float(lra[-1])
        except ValueError:
            pass
    m.step("audio", "ok", f"audio.wav written; {len(silences)} silent interval(s) of 0.5s or more")


def check_transcribers(m: Manifest) -> None:
    found = [n for n in ("whisper", "faster-whisper", "whisper-cli") if shutil.which(n)]
    for mod in ("faster_whisper", "whisper"):
        if importlib.util.find_spec(mod):
            found.append(f"python:{mod}")
    if found:
        m.step("speech", "skipped", "transcriber available (" + ", ".join(found) + ") but not run by this script; run it on audio.wav")
    else:
        m.step("speech", "skipped", "no transcriber found")
    m.limit("Speech has not been transcribed; spoken content cannot be confirmed without a transcript, captions, or user-supplied text.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--out", help="output folder (default: ./evidence_<name>)")
    ap.add_argument("--interval", type=float, help="seconds between uniform frames (default: auto)")
    ap.add_argument("--max-frames", type=int, default=60)
    ap.add_argument("--scene-threshold", type=float, default=0.3)
    ap.add_argument("--max-scenes", type=int, default=80)
    ap.add_argument("--start", type=float, default=0.0, help="window start in seconds (for chunking long videos)")
    ap.add_argument("--length", type=float, help="window length in seconds")
    args = ap.parse_args()

    src = Path(args.input)
    if not src.is_file():
        print(f"error: input not found: {src}", file=sys.stderr)
        return 2
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            print(f"error: {tool} not found on PATH", file=sys.stderr)
            return 2
    if (args.start < 0 or (args.length is not None and args.length <= 0) or args.max_frames < 1
            or args.max_scenes < 1 or (args.interval is not None and args.interval <= 0)):
        print("error: --start must be >= 0; --length, --interval, --max-frames, --max-scenes must be positive", file=sys.stderr)
        return 2

    info = probe(src)
    if info is None or not info.get("streams"):
        print(f"error: {src} is not a readable media file (ffprobe failed)", file=sys.stderr)
        return 2

    out = Path(args.out) if args.out else Path(f"evidence_{src.stem}")
    out.mkdir(parents=True, exist_ok=True)

    m = Manifest()
    video, audio, subs = describe_streams(info, m)
    total = m.intake["duration_s"]

    inopts: list[str] = []
    offset = 0.0
    eff = total
    if args.start > 0 or args.length is not None:
        if total is not None and args.start >= total:
            print(f"error: --start {args.start} is beyond the duration {total}s", file=sys.stderr)
            return 2
        offset = args.start
        if args.start > 0:
            inopts += ["-ss", str(args.start)]
        if args.length is not None:
            inopts += ["-t", str(args.length)]
        eff = (min(args.length, total - args.start) if (args.length and total) else (total - args.start if total else args.length))
        m.window = {"start_s": fmt_num(offset), "end_s": fmt_num(offset + eff) if eff else None}
        m.limit(f"Only the window {m.window['start_s']}s to {m.window['end_s']}s was extracted; the rest of the file was not examined.")
    elif total and total > LONG_VIDEO_S:
        m.limit(f"Video is {total:.0f}s long; consider chunking with --start/--length and merging per-chunk notes.")

    if video is None:
        m.intake["basis"] = "audio_only"
        m.step("uniform_frames", "skipped", "no video stream")
        m.step("scene_changes", "skipped", "no video stream")
        m.step("contact_sheets", "skipped", "no video stream")
        m.limit("No video stream: visual content cannot be assessed.")
    else:
        interval = args.interval if args.interval is not None else (
            max(1.0, round((eff or 0) / args.max_frames * 2) / 2) if eff else 2.0)
        m.intake["sampling_interval_s"] = interval
        m.intake["timestamp_precision_s"] = interval
        m.limit(f"Analysis is based on sampled frames (every {interval}s); events between samples may be missed and uniform-frame timestamps are only precise to about {interval}s.")
        extract_uniform(inopts, src, out, interval, args.max_frames, offset, m)
        extract_scenes(inopts, src, out, args.scene_threshold, args.max_scenes, offset, m)
        extract_sheets(inopts, src, out, eff, offset, m)

    extract_subtitles(src, out, subs, m)
    if audio:
        extract_audio(inopts, src, out, offset, eff, m)
        check_transcribers(m)
    else:
        m.step("audio", "skipped", "no audio stream")
        m.step("speech", "skipped", "no audio stream")
        m.limit("No audio stream: audio and speech analysis are unavailable.")

    manifest = out / "manifest.json"
    manifest.write_text(json.dumps(m.as_dict(str(src)), indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"manifest: {manifest}")
    for name, st in m.steps.items():
        print(f"  {name:15s} {st['status']:8s} {st['detail']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
