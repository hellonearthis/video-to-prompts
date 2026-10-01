#!/usr/bin/env python3
"""Check a video-analysis JSON file against the skill's own rules.

Reads the schema in references/segment-schema.json (single source of truth for
field names and enum values) and adds the semantic checks the schema cannot
express: timestamp sanity, claim/evidence consistency, audio claims without
audio, "confirmed" inferences, mind-reading and diagnosis language, and
agreement with a manifest.json from extract_evidence.py.

Usage:
    python3 validate_analysis.py analysis.json [--manifest manifest.json]
        [--schema path] [--strict] [--json]

Exit codes: 0 = no errors, 1 = errors (or warnings with --strict),
2 = file could not be read or parsed.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path

DEFAULT_SCHEMA = Path(__file__).resolve().parent.parent / "references" / "segment-schema.json"

GENRE_WORDS = re.compile(
    r"\b(hook|montage|glitch|found footage|call to action|channel[- ]surf\w*|jump scare|leitmotif|callback|trailer|cold open)\b", re.I)
MIND_READING = re.compile(
    r"\b(intends?|intended|intentionally|deliberately|wants? to|wanted to|is trying to|are trying to|trying to|clearly|obviously|must have)\b", re.I)
DIAGNOSIS = re.compile(
    r"\b(depress\w*|traumati[sz]ed|psychotic|manic|schizophren\w*|suicidal|autistic|bipolar|is lying|are lying|was lying|lied)\b", re.I)


class Issues:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, level: str, code: str, path: str, msg: str) -> None:
        self.items.append({"level": level, "code": code, "path": path, "message": msg})

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i["level"] == level)


# ---------------------------------------------------------------- timestamps

def parse_time(value) -> float | None:
    """Seconds from a number, '12.5', 'mm:ss', 'mm:ss.ms' or 'hh:mm:ss'. None if malformed."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value == value and abs(value) != float("inf") else None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", text):
        return float(text)
    parts = text.split(":")
    if len(parts) not in (2, 3) or not all(re.fullmatch(r"\d+(\.\d+)?", p) for p in parts):
        return None
    secs = float(parts[-1])
    mins = int(float(parts[-2])) if "." not in parts[-2] else None
    if mins is None or secs >= 60:
        return None
    if len(parts) == 3:
        hrs = int(parts[0]) if "." not in parts[0] else None
        if hrs is None or mins >= 60:
            return None
        return hrs * 3600 + mins * 60 + secs
    return mins * 60 + secs


# ------------------------------------------------- minimal JSON-schema subset

def _type_ok(t: str, v) -> bool:
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    return {"string": isinstance(v, str), "boolean": isinstance(v, bool), "object": isinstance(v, dict),
            "array": isinstance(v, list), "null": v is None}.get(t, True)


def schema_check(schema: dict, value, path: str, issues: Issues) -> None:
    t = schema.get("type")
    if t is not None:
        types = t if isinstance(t, list) else [t]
        if not any(_type_ok(x, value) for x in types):
            issues.add("error", "wrong-type", path or "$", f"expected {'/'.join(types)}, got {type(value).__name__}")
            return
    if "enum" in schema and value not in schema["enum"]:
        issues.add("error", "bad-enum", path or "$", f"{value!r} is not one of {schema['enum']}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                issues.add("error", "missing-field", f"{path}.{key}".lstrip("."), "required field is missing")
        props = schema.get("properties")
        if props is not None:
            for key, sub in value.items():
                if key in props:
                    schema_check(props[key], sub, f"{path}.{key}".lstrip("."), issues)
                else:
                    issues.add("warning", "unknown-field", f"{path}.{key}".lstrip("."), "field is not in the schema (typo?)")
    elif isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            schema_check(schema["items"], item, f"{path}[{i}]", issues)


# ----------------------------------------------------------- semantic checks

def blank(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not v)


def semantic_checks(doc: dict, issues: Issues) -> None:
    intake = doc.get("intake") if isinstance(doc.get("intake"), dict) else {}
    segs = doc.get("segments") if isinstance(doc.get("segments"), list) else []
    basis = intake.get("basis")
    has_audio = intake.get("has_audio")
    precision = intake.get("timestamp_precision_s")
    tol = precision if isinstance(precision, (int, float)) and not isinstance(precision, bool) and precision > 0 else 0.5
    duration = parse_time(intake.get("duration_s")) if intake.get("duration_s") is not None else None

    # intake
    if basis in ("sampled_frames",) and blank(intake.get("sampling_interval_s")) and blank(intake.get("timestamp_precision_s")):
        issues.add("warning", "missing-precision", "intake", "sampled frames used but no sampling interval or timestamp precision stated")
    if basis in ("sampled_frames", "transcript_only", "audio_only", "metadata_only", "user_description") or has_audio is False:
        if blank(intake.get("limitations")):
            issues.add("warning", "no-limitations", "intake.limitations", "the basis or missing audio implies limitations, but none are listed")
    if blank(doc.get("unknowns")):
        issues.add("warning", "no-unknowns", "unknowns", "no unknowns listed; creator intent, source, or authenticity are rarely all knowable")

    # segments
    seen: dict[str, int] = {}
    spans: list[tuple[int, str, float, float]] = []
    for i, seg in enumerate(segs):
        if not isinstance(seg, dict):
            continue
        p = f"segments[{i}]"
        sid = seg.get("id")
        if isinstance(sid, str):
            if sid in seen:
                issues.add("error", "duplicate-id", f"{p}.id", f"id {sid!r} already used by segments[{seen[sid]}]")
            seen[sid] = i
        s, e = parse_time(seg.get("start_s")), parse_time(seg.get("end_s"))
        for key, val in (("start_s", s), ("end_s", e)):
            raw = seg.get(key)
            if raw is not None and val is None:
                issues.add("error", "bad-timestamp", f"{p}.{key}", f"{raw!r} is not a valid time (use seconds, mm:ss or hh:mm:ss)")
            elif val is not None and val < 0:
                issues.add("error", "negative-time", f"{p}.{key}", "time is negative")
            elif isinstance(raw, str) and val is not None:
                issues.add("note", "string-time", f"{p}.{key}", f"{raw!r} read as {val:g}s; the schema prefers numeric seconds")
        if s is not None and e is not None:
            if e < s:
                issues.add("error", "bad-range", p, f"end ({e:g}s) is before start ({s:g}s)")
            else:
                if e == s:
                    issues.add("warning", "zero-length", p, "segment has zero length")
                spans.append((i, str(sid), s, e))
                if duration is not None and e > duration + tol:
                    issues.add("error", "beyond-duration", p, f"segment ends at {e:g}s but the media is {duration:g}s long")
        if basis not in ("audio_only", "transcript_only", "metadata_only") and blank(seg.get("visual")):
            issues.add("warning", "empty-visual", f"{p}.visual", "no visual description although visual content is expected for this basis")
        label = seg.get("label")
        if isinstance(label, str) and GENRE_WORDS.search(label):
            issues.add("note", "genre-label", f"{p}.label", f"label {label!r} uses a genre/technique term; keep it only if the evidence supports it")

        for j, t in enumerate(seg.get("text_on_screen") or []):
            if isinstance(t, dict):
                if t.get("legible") in ("full", "partial") and blank(t.get("text")):
                    issues.add("error", "empty-text", f"{p}.text_on_screen[{j}]", "marked legible but no text recorded")
                if t.get("legible") == "illegible" and not blank(t.get("text")) and "[" not in str(t.get("text")):
                    issues.add("warning", "illegible-with-text", f"{p}.text_on_screen[{j}]", "marked illegible but text is given as if certain; mark guesses with [unclear: ...]")
        for j, sp in enumerate(seg.get("speech") or []):
            if isinstance(sp, dict):
                if blank(sp.get("speaker_label")):
                    issues.add("error", "no-speaker-label", f"{p}.speech[{j}]", "speech needs a neutral speaker label (e.g. Speaker 1, narrator)")
                if sp.get("clarity") in ("partial", "unclear") and "[" not in str(sp.get("text", "")):
                    issues.add("warning", "unmarked-uncertainty", f"{p}.speech[{j}]", "unclear speech should mark uncertain words with [unclear: ...] or [inaudible]")

        if has_audio is False and (not blank(seg.get("audio")) or not blank(seg.get("speech"))):
            issues.add("error", "audio-without-audio", p, "audio or speech is described but intake.has_audio is false")
        if intake.get("speech_analyzed") is False and not blank(seg.get("speech")):
            issues.add("warning", "speech-not-analyzed", f"{p}.speech", "speech is recorded but intake.speech_analyzed is false; state where the transcript came from")

        for j, c in enumerate(seg.get("claims") or []):
            if not isinstance(c, dict):
                continue
            cp = f"{p}.claims[{j}]"
            status, source, conf = c.get("status"), c.get("source"), c.get("confidence")
            text = str(c.get("claim", ""))
            if status in ("inferred", "hypothesis") and conf is None:
                issues.add("error", "missing-confidence", cp, f"{status} claims need a confidence level")
            if conf == "confirmed" and status != "observed":
                issues.add("error", "confirmed-not-observed", cp, f"a {status} claim cannot be 'confirmed'")
            if status == "unknown" and conf not in (None, "uncertain"):
                issues.add("warning", "unknown-confidence", cp, "an unknown should carry no confidence or 'uncertain'")
            if source == "user" and status == "observed":
                issues.add("error", "user-as-observation", cp, "user-supplied context is not an observation")
            if status == "observed":
                if source == "visual" and blank(seg.get("visual")) :
                    issues.add("error", "unsupported-claim", cp, "observed visual claim but the segment has no visual description")
                if source == "visual" and basis in ("audio_only", "transcript_only", "metadata_only", "user_description"):
                    issues.add("error", "basis-mismatch", cp, f"observed visual claim is impossible with basis {basis!r}")
                if source == "audio" and blank(seg.get("audio")) and blank(seg.get("speech")):
                    issues.add("error", "unsupported-claim", cp, "observed audio claim but the segment has no audio or speech record")
                if source == "audio" and (has_audio is False or basis in ("metadata_only", "user_description")):
                    issues.add("error", "basis-mismatch", cp, "observed audio claim without audio evidence")
                if source == "text" and blank(seg.get("text_on_screen")) and blank(seg.get("speech")):
                    issues.add("error", "unsupported-claim", cp, "observed text claim but the segment records no on-screen text")
                if MIND_READING.search(text):
                    issues.add("warning", "mind-reading", cp, "observed claim contains intent/certainty language; describe behavior, label intent as inferred")
            if DIAGNOSIS.search(text):
                issues.add("warning", "diagnosis", cp, "claim reads as a diagnosis or judgment of a person's inner state; describe visible/audible cues instead")

    # ordering, overlaps, coverage
    ordered = sorted(spans, key=lambda x: (x[2], x[3]))
    if [x[0] for x in spans] != [x[0] for x in ordered]:
        issues.add("warning", "unsorted", "segments", "segments are not in chronological order")
    for (ia, ida, sa, ea), (ib, idb, sb, eb) in zip(ordered, ordered[1:]):
        if sb < ea - 1e-6:
            issues.add("warning", "overlap", f"segments[{ib}]", f"{idb} starts at {sb:g}s before {ida} ends at {ea:g}s")
    if duration and ordered:
        covered, cursor = 0.0, 0.0
        for _, _, s, e in ordered:
            s, e = max(s, cursor), min(e, duration)
            if e > s:
                covered += e - s
                cursor = e
        pct = covered / duration
        issues.add("note", "coverage", "segments", f"segments cover {pct:.0%} of the {duration:g}s duration")
        if pct < 0.8:
            issues.add("warning", "low-coverage", "segments", f"segments cover only {pct:.0%} of the media; state which parts were not examined")

    # interpretations
    for i, it in enumerate(doc.get("interpretations") or []):
        if isinstance(it, dict):
            p = f"interpretations[{i}]"
            if blank(it.get("supporting")):
                issues.add("error", "no-support", p, "interpretation lists no supporting evidence")
            if blank(it.get("alternatives")):
                issues.add("warning", "no-alternatives", p, "no alternative explanations given")
            if blank(it.get("opposing")):
                issues.add("note", "no-opposing", p, "no opposing evidence listed (say 'none found' if you looked)")


def manifest_checks(doc: dict, manifest: dict, issues: Issues) -> None:
    a = doc.get("intake") if isinstance(doc.get("intake"), dict) else {}
    m = manifest.get("intake", {})
    if a.get("basis") == "direct_playback" and m.get("basis") in ("sampled_frames", "audio_only"):
        issues.add("error", "overclaimed-basis", "intake.basis", f"analysis claims direct playback but the extraction produced {m.get('basis')}")
    ad, md = parse_time(a.get("duration_s")) if a.get("duration_s") is not None else None, m.get("duration_s")
    if ad is not None and md is not None and abs(ad - md) > 1.0:
        issues.add("error", "duration-mismatch", "intake.duration_s", f"analysis says {ad:g}s, extraction measured {md:g}s")
    if isinstance(a.get("has_audio"), bool) and isinstance(m.get("has_audio"), bool) and a["has_audio"] != m["has_audio"]:
        issues.add("error", "audio-mismatch", "intake.has_audio", f"analysis says {a['has_audio']}, extraction found {m['has_audio']}")
    ai, mi = a.get("sampling_interval_s"), m.get("sampling_interval_s")
    if isinstance(ai, (int, float)) and isinstance(mi, (int, float)) and abs(ai - mi) > 1e-6:
        issues.add("warning", "interval-mismatch", "intake.sampling_interval_s", f"analysis says {ai:g}s, extraction used {mi:g}s")
    if a.get("speech_analyzed") is True and m.get("speech_analyzed") is False:
        issues.add("note", "speech-source", "intake.speech_analyzed", "extraction did not transcribe speech; make sure the transcript source is stated")
    if m.get("has_audio") is False and isinstance(a.get("limitations"), list) and not any("audio" in str(x).lower() for x in a["limitations"]):
        issues.add("warning", "limitation-missing", "intake.limitations", "the file has no audio stream but the limitations do not say so")


# ------------------------------------------------------------------- driver

def normalize_times(doc: dict) -> dict:
    """Copy of doc where parseable string times are numbers, so the schema check only flags truly bad values."""
    out = copy.deepcopy(doc)
    for seg in out.get("segments", []) if isinstance(out.get("segments"), list) else []:
        if isinstance(seg, dict):
            for key in ("start_s", "end_s"):
                if isinstance(seg.get(key), str):
                    t = parse_time(seg[key])
                    if t is not None:
                        seg[key] = t
    return out


def validate(doc, schema: dict, manifest: dict | None = None) -> Issues:
    issues = Issues()
    if not isinstance(doc, dict):
        issues.add("error", "wrong-type", "$", "top level must be a JSON object")
        return issues
    schema_check(schema, normalize_times(doc), "", issues)
    semantic_checks(doc, issues)
    if manifest:
        manifest_checks(doc, manifest, issues)
    return issues


def load_json(path: Path, what: str):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        print(f"error: {what} not found: {path}", file=sys.stderr)
    except json.JSONDecodeError as exc:
        print(f"error: {what} is not valid JSON (line {exc.lineno}, column {exc.colno}): {exc.msg}", file=sys.stderr)
    except OSError as exc:
        print(f"error: cannot read {what}: {exc}", file=sys.stderr)
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("analysis")
    ap.add_argument("--manifest")
    ap.add_argument("--schema", default=str(DEFAULT_SCHEMA))
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    ap.add_argument("--json", action="store_true", help="print issues as JSON")
    args = ap.parse_args()

    doc = load_json(Path(args.analysis), "analysis file")
    schema = load_json(Path(args.schema), "schema")
    manifest = load_json(Path(args.manifest), "manifest") if args.manifest else None
    if doc is None or schema is None or (args.manifest and manifest is None):
        return 2

    issues = validate(doc, schema, manifest)
    errors, warnings, notes = issues.count("error"), issues.count("warning"), issues.count("note")
    if args.json:
        print(json.dumps({"errors": errors, "warnings": warnings, "notes": notes, "issues": issues.items}, indent=2, ensure_ascii=False))
    else:
        order = {"error": 0, "warning": 1, "note": 2}
        for it in sorted(issues.items, key=lambda x: order[x["level"]]):
            print(f"{it['level'].upper():8s} {it['code']:22s} {it['path']}: {it['message']}")
        print(f"\n{errors} error(s), {warnings} warning(s), {notes} note(s)")
    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
