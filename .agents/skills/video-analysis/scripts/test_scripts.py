#!/usr/bin/env python3
"""Tests for extract_evidence.py and validate_analysis.py.

Run:  python3 scripts/test_scripts.py
Generates small synthetic clips with ffmpeg (needs ffmpeg/ffprobe on PATH).
"""
from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_analysis as va  # noqa: E402

EXTRACT = HERE / "extract_evidence.py"
SCHEMA = json.loads((HERE.parent / "references" / "segment-schema.json").read_text())
EXAMPLE = json.loads((HERE.parent / "references" / "example-analysis.json").read_text())
HAVE_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def codes(doc, manifest=None, level=None):
    issues = va.validate(doc, SCHEMA, manifest)
    return {i["code"] for i in issues.items if level is None or i["level"] == level}


class ValidatorTests(unittest.TestCase):
    def test_example_has_no_errors_or_warnings(self):
        issues = va.validate(EXAMPLE, SCHEMA)
        self.assertEqual(issues.count("error"), 0, issues.items)
        self.assertEqual(issues.count("warning"), 0, issues.items)

    def mutated(self, fn):
        d = copy.deepcopy(EXAMPLE)
        fn(d)
        return d

    def test_time_parsing(self):
        for ok, expect in [("00:12", 12), ("1:02:03", 3723), ("0:05.5", 5.5), (7, 7), ("9.5", 9.5)]:
            self.assertEqual(va.parse_time(ok), expect, ok)
        for bad in ["1:99", "abc", "12:", "1:2:3:4", True, None, [], "01:60", "1.5:30"]:
            self.assertIsNone(va.parse_time(bad), bad)

    def test_mmss_accepted_malformed_rejected(self):
        d = self.mutated(lambda x: x["segments"][0].update(start_s="00:00", end_s="00:04"))
        self.assertEqual(va.validate(d, SCHEMA).count("error"), 0)
        d = self.mutated(lambda x: x["segments"][0].update(start_s="1:99"))
        self.assertIn("bad-timestamp", codes(d, level="error"))

    def test_range_duplicate_and_duration(self):
        d = self.mutated(lambda x: x["segments"][1].update(end_s=2))
        self.assertIn("bad-range", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][1].update(id="S1"))
        self.assertIn("duplicate-id", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][2].update(end_s=40))
        self.assertIn("beyond-duration", codes(d, level="error"))

    def test_overlap_gap_coverage(self):
        d = self.mutated(lambda x: x["segments"][1].update(start_s=3))
        self.assertIn("overlap", codes(d, level="warning"))
        self.assertNotIn("low-coverage", codes(EXAMPLE))
        d = self.mutated(lambda x: x["segments"].pop())  # 8 of 12 s covered
        self.assertIn("low-coverage", codes(d, level="warning"))
        d = self.mutated(lambda x: x.update(segments=x["segments"][:1]))
        self.assertIn("low-coverage", codes(d, level="warning"))

    def test_missing_required_and_unknown_field(self):
        d = self.mutated(lambda x: x["segments"][0].pop("visual"))
        self.assertIn("missing-field", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0].update(visul="typo"))
        self.assertIn("unknown-field", codes(d, level="warning"))
        d = self.mutated(lambda x: x.pop("intake"))
        self.assertIn("missing-field", codes(d, level="error"))

    def test_bad_enum_is_error_not_coerced(self):
        d = self.mutated(lambda x: x["segments"][0]["claims"][0].update(confidence="hihg"))
        self.assertIn("bad-enum", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0]["claims"][0].update(source="editorial"))
        self.assertIn("bad-enum", codes(d, level="error"))

    def test_claim_rules(self):
        d = self.mutated(lambda x: x["segments"][1]["claims"][1].pop("confidence"))
        self.assertIn("missing-confidence", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][1]["claims"][1].update(confidence="confirmed"))
        self.assertIn("confirmed-not-observed", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0]["claims"][0].update(source="user"))
        self.assertIn("user-as-observation", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0].update(visual=""))
        self.assertIn("unsupported-claim", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0]["claims"][0].update(source="text"))
        self.assertIn("unsupported-claim", codes(d, level="error"))

    def test_audio_without_audio_and_basis(self):
        d = self.mutated(lambda x: x["intake"].update(has_audio=False))
        self.assertIn("audio-without-audio", codes(d, level="error"))
        d = self.mutated(lambda x: x["intake"].update(basis="user_description"))
        self.assertIn("basis-mismatch", codes(d, level="error"))

    def test_language_lints(self):
        d = self.mutated(lambda x: x["segments"][0]["claims"][0].update(claim="The director clearly wants to unsettle viewers"))
        self.assertIn("mind-reading", codes(d, level="warning"))
        d = self.mutated(lambda x: x["segments"][0]["claims"][0].update(claim="The speaker is depressed", status="inferred", confidence="possible"))
        self.assertIn("diagnosis", codes(d, level="warning"))
        d = self.mutated(lambda x: x["segments"][0].update(label="Cold open montage"))
        self.assertIn("genre-label", codes(d, level="note"))

    def test_interpretation_rules(self):
        d = self.mutated(lambda x: x["interpretations"][0].update(supporting=[]))
        self.assertIn("no-support", codes(d, level="error"))
        d = self.mutated(lambda x: x["interpretations"][0].update(alternatives=[]))
        self.assertIn("no-alternatives", codes(d, level="warning"))
        d = self.mutated(lambda x: x["interpretations"][0].update(confidence="confirmed"))
        self.assertIn("bad-enum", codes(d, level="error"))

    def test_text_and_speech_rules(self):
        d = self.mutated(lambda x: x["segments"][0].update(text_on_screen=[{"text": "", "legible": "full", "kind": "overlay"}]))
        self.assertIn("empty-text", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0].update(speech=[{"speaker_label": "", "text": "hi", "clarity": "clear"}]))
        self.assertIn("no-speaker-label", codes(d, level="error"))
        d = self.mutated(lambda x: x["segments"][0].update(speech=[{"speaker_label": "Speaker 1", "text": "maybe hello", "clarity": "unclear"}]))
        self.assertIn("unmarked-uncertainty", codes(d, level="warning"))

    def test_empty_and_wrong_toplevel(self):
        self.assertIn("wrong-type", codes([]))
        self.assertIn("missing-field", codes({}))

    def test_manifest_agreement(self):
        m = {"intake": {"basis": "sampled_frames", "duration_s": 12.0, "has_audio": True, "sampling_interval_s": 1.0, "speech_analyzed": False}}
        self.assertEqual(va.validate(EXAMPLE, SCHEMA, m).count("error"), 0)
        d = self.mutated(lambda x: x["intake"].update(basis="direct_playback"))
        self.assertIn("overclaimed-basis", codes(d, m, "error"))
        d = self.mutated(lambda x: x["intake"].update(duration_s=60))
        self.assertIn("duration-mismatch", codes(d, m, "error"))
        d = self.mutated(lambda x: x["intake"].update(has_audio=False))
        self.assertIn("audio-mismatch", codes(d, m, "error"))


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg not available")
class ExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        t = cls.tmp

        def ff(*args):
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)

        ff("-f", "lavfi", "-i", "color=c=red:s=320x240:r=25:d=4", "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=4",
           "-f", "lavfi", "-i", "color=c=green:s=320x240:r=25:d=4", "-f", "lavfi", "-i", "sine=frequency=440:d=4",
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-f", "lavfi", "-i", "sine=frequency=880:d=4",
           "-filter_complex", "[4:a]atrim=0:4,asetpts=PTS-STARTPTS[s];[3:a][s][5:a]concat=n=3:v=0:a=1[a];[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
           "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(t / "clip.mp4"))
        ff("-i", str(t / "clip.mp4"), "-an", "-c:v", "copy", str(t / "silent.mp4"))
        ff("-i", str(t / "clip.mp4"), "-vn", "-c:a", "copy", str(t / "audio.m4a"))
        (t / "s.srt").write_text("1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:05,000 --> 00:00:06,000\nWorld\n")
        ff("-i", str(t / "clip.mp4"), "-i", str(t / "s.srt"), "-c", "copy", "-c:s", "mov_text", str(t / "subbed.mp4"))
        (t / "fake.mp4").write_text("not media")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def run_extract(self, name, *extra, out=None):
        out = out or self.tmp / f"out_{name}_{abs(hash(extra))}"
        p = subprocess.run([sys.executable, str(EXTRACT), str(self.tmp / name), "--out", str(out), *extra], capture_output=True, text=True)
        manifest = json.loads((out / "manifest.json").read_text()) if (out / "manifest.json").exists() else None
        return p, manifest, out

    def test_full_clip(self):
        p, m, out = self.run_extract("clip.mp4")
        self.assertEqual(p.returncode, 0, p.stderr)
        i = m["intake"]
        self.assertEqual(i["basis"], "sampled_frames")
        self.assertTrue(i["has_audio"])
        self.assertAlmostEqual(i["duration_s"], 12.0, delta=0.1)
        self.assertEqual(i["technical"]["resolution"], "320x240")
        cuts = [c["cut_time_s"] for c in m["files"]["scene_frames"]]
        self.assertEqual(len(cuts), 2)
        self.assertAlmostEqual(cuts[0], 4.0, delta=0.2)
        self.assertAlmostEqual(cuts[1], 8.0, delta=0.2)
        sil = m["measurements"]["silences"]
        self.assertEqual(len(sil), 1)
        self.assertAlmostEqual(sil[0]["start_s"], 4.0, delta=0.3)
        self.assertAlmostEqual(sil[0]["end_s"], 8.0, delta=0.3)
        self.assertEqual(len(m["files"]["uniform_frames"]), 12)
        for f in m["files"]["uniform_frames"] + m["files"]["scene_frames"]:
            self.assertTrue((out / f["file"]).is_file())
        self.assertTrue((out / "audio.wav").is_file())
        self.assertTrue(m["steps"]["speech"]["status"] == "skipped")
        self.assertFalse(i["speech_analyzed"])

    def test_manifest_intake_validates_with_example(self):
        p, m, _ = self.run_extract("clip.mp4")
        self.assertEqual(va.validate(EXAMPLE, SCHEMA, m).count("error"), 0)

    def test_manifest_intake_is_schema_compatible(self):
        p, m, _ = self.run_extract("subbed.mp4")
        doc = copy.deepcopy(EXAMPLE)
        doc["intake"] = m["intake"]
        issues = va.validate(doc, SCHEMA)
        self.assertNotIn("unknown-field", {i["code"] for i in issues.items}, issues.items)
        self.assertEqual(issues.count("error"), 0, [i for i in issues.items if i["level"] == "error"])

    def test_no_audio(self):
        p, m, _ = self.run_extract("silent.mp4")
        self.assertEqual(p.returncode, 0)
        self.assertFalse(m["intake"]["has_audio"])
        self.assertEqual(m["steps"]["audio"]["status"], "skipped")
        self.assertTrue(any("No audio" in x for x in m["intake"]["limitations"]))

    def test_audio_only(self):
        p, m, _ = self.run_extract("audio.m4a")
        self.assertEqual(p.returncode, 0)
        self.assertEqual(m["intake"]["basis"], "audio_only")
        self.assertEqual(m["steps"]["uniform_frames"]["status"], "skipped")
        self.assertEqual(m["steps"]["audio"]["status"], "ok")

    def test_subtitles(self):
        p, m, out = self.run_extract("subbed.mp4")
        self.assertEqual(m["steps"]["subtitles"]["status"], "ok")
        self.assertEqual(m["files"]["subtitles"][0]["cues"], 2)

    def test_window_offsets(self):
        p, m, _ = self.run_extract("clip.mp4", "--start", "3", "--length", "6")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(m["window"], {"start_s": 3.0, "end_s": 9.0})
        times = [f["time_s"] for f in m["files"]["uniform_frames"]]
        self.assertAlmostEqual(min(times), 3.0, delta=0.1)
        self.assertLessEqual(max(times), 9.0)
        cuts = [c["cut_time_s"] for c in m["files"]["scene_frames"]]
        self.assertAlmostEqual(cuts[0], 4.0, delta=0.2)
        self.assertTrue(any("window" in x for x in m["intake"]["limitations"]))

    def test_scene_cap(self):
        p, m, out = self.run_extract("clip.mp4", "--max-scenes", "1")
        self.assertEqual(len(m["files"]["scene_frames"]), 1)
        self.assertEqual(len(list((out / "frames").glob("scene_*.jpg"))), 1)
        self.assertTrue(any("capped" in x for x in m["intake"]["limitations"]))

    def test_fatal_inputs(self):
        for name in ("fake.mp4", "missing.mp4"):
            p = subprocess.run([sys.executable, str(EXTRACT), str(self.tmp / name), "--out", str(self.tmp / "x")], capture_output=True, text=True)
            self.assertEqual(p.returncode, 2, name)
            self.assertIn("error:", p.stderr)
        for bad in (["--interval", "0"], ["--start", "99"], ["--length", "-1"]):
            p = subprocess.run([sys.executable, str(EXTRACT), str(self.tmp / "clip.mp4"), "--out", str(self.tmp / "y"), *bad], capture_output=True, text=True)
            self.assertEqual(p.returncode, 2, bad)


if __name__ == "__main__":
    unittest.main(verbosity=1)
