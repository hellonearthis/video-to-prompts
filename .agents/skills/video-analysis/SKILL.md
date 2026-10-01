---
name: video-analysis
description: Evidence-based method for analyzing video, clips, screen recordings, animations, or extracted frames/audio/transcripts, and producing descriptions, timelines, shot logs, summaries, captions, accessibility or safety reviews, critiques, tags, or reusable rules. Use this whenever the user supplies or links a video, frame sequence, audio track, transcript, caption file, or shot list and wants to know what it contains, how it is structured, what is said or shown, or how to improve or categorize it, even if they never say "analyze". Works for any genre or purpose and keeps observation, inference, and speculation separate.
---

# Video Analysis

A genre-neutral method for analyzing video using only the evidence actually available. Every claim must be traceable to the media or to user-supplied context, and the output must say what it cannot know.

## Core rules

1. **Media-bound.** Analyze only what you actually have (video, frames, audio, transcript, captions, shot list, metadata, or user description). Never pretend to have watched or heard something you did not. If only a description exists, say the analysis is description-based, not observed.
2. **Evidence first.** Observation, inference, hypothesis, and unknown stay visibly separate. Never present inference as observation.
3. **No imported frames.** Do not assume genre, style, intent, or aesthetic (montage, horror, found footage, satire, etc.) from prior conversation, earlier projects, or the expected output. Propose a frame only when the media supports it, or when the user explicitly asks for that framework. Candidate frames are hypotheses, not starting points.
4. **No mind-reading.** Creator intent is unknown unless the user, the video, or metadata states it. Otherwise hedge: "may suggest", "consistent with", "I can't confirm intent from the media alone."
5. **Identity and diagnosis boundaries.** See `references/safety-privacy.md`. In short: no face-based identification, no inferring protected characteristics, no psychological or medical diagnosis. Describe visible behavior, not inner states.
6. **User context is labeled, not trusted blindly.** Treat what the user says about the video as context, not observation. If the media contradicts it, say so plainly.
7. **Reproducible.** Another reviewer with the same media should be able to check each claim. Use timestamps or segment IDs.
8. **Uncertainty is output.** State sampling limits, missing audio, illegible text, unclear speech, occlusion, compression, and missing metadata when they affect the answer.

## Step 0: Intake (always do this first)

Establish and state in one or two lines:

- **What I have:** full video, sampled frames, audio only, transcript/captions only, metadata only, or user description only.
- **Basis:** direct playback / sampled frames (give interval) / transcript-derived / description-based.
- **Known gaps:** no audio, truncated file, partial clip, low resolution, unknown timeline origin.

If a video file is in the sandbox, follow `references/tooling.md` to extract metadata, frames, scene changes, and audio before analyzing. Do not describe content you have not extracted or viewed. If nothing usable is available, say so and ask for the file, frames, or a transcript.

Timestamps from sampled frames are only as precise as the sampling interval. State that precision (for example "timestamps ±2 s").

## Scale to the request

- **Specific question** ("what does she say at the end?", "is there text on screen?"): answer directly first, then give the timestamped evidence. No full report.
- **Standard** (describe/summarize/review): intake, short overview, timeline of segments, key observations by channel, uncertainties.
- **Exhaustive** (forensic, accessibility, dataset annotation, shot log): full segment records, transcripts, text capture, cross-modal notes, unknowns.
- **Long video** (more than about 10 minutes, or many segments): process in chunks, produce per-chunk notes, then merge into a hierarchical summary. State which chunks were examined in detail versus skimmed.

When unsure of depth, give the standard tier and offer to go deeper.

## Workflow

1. **Technical facts.** Duration, resolution, frame rate, aspect ratio, audio streams, subtitles, metadata. Record them without interpreting. Do not infer production method from technical fields alone.
2. **Neutral first pass.** Continuous or segmented? Mostly visual, auditory, textual, or mixed? Depicts people, objects, interfaces, environments, graphics, or abstract patterns? Treat the answers as first impressions, not conclusions.
3. **Segment.** Let boundaries emerge from the media: cuts, fades, audio breaks, silence, music changes, speech turns, text cards, interface-state changes, location or subject changes, completed actions. Choose granularity to fit the task (frame, shot, event, scene, utterance, musical phrase, interface state, semantic block). Do not default to shot-level for everything.
4. **Describe each segment concretely, by channel.**
   - *Visual:* subjects, objects, actions, setting, framing, camera position and movement, focus, lighting, color, motion, graphics, on-screen text and where it sits.
   - *Audio:* speech (transcribe only what is intelligible; mark `[inaudible]` or `[unclear: word?]` rather than guessing), music, effects, ambience, silence, volume and pitch changes.
   - *Text:* quote exactly, note placement and duration, say whether it is in-scene (diegetic) or an overlay, and flag illegible text.
   - *Actions:* use concrete verbs and cautious language. "A hand moves toward the object; contact is uncertain." Observable action is not intention.
   - *Space and time:* one space or several, connected or not, time progressing, repeating, compressing, or fragmenting.
5. **Relations and patterns.** Compare image, sound, and text: synchrony, offset, contradiction, reinforcement, counterpoint, masking, emphasis. Look for repetition, contrast, escalation, interruption, return, omission. Name a pattern with a technical term (leitmotif, callback, jump cut, glitch, montage) only when the evidence supports it.
6. **Interpret last.** Offer candidate interpretations only after the evidence is organized. For each, give supporting evidence, opposing evidence, alternatives, and confidence. Keep description, analysis, and judgment apart (see `references/evidence-and-confidence.md`).
7. **List unknowns.** Creator intent, source of footage, authenticity, identity, location, audio origin, whether effects are in-camera, editorial, or generated.
8. **Verify** before answering (checklist below).

If the content clearly belongs to a known form (tutorial, interview, ad, screen recording, news piece, short-form, performance, surveillance, narrative, animation), load the matching section of `references/modules.md` after the first pass to know what to extract. A module is a lens you apply because the evidence supports it, never an assumption made in advance.

## Tagging claims

Tag claims that carry weight, not every sentence. Use a compact inline form after the claim:

`(source · status · confidence)`

- **source:** `visual`, `audio`, `text`, `temporal`, `metadata`, `user`
- **status:** `observed`, `inferred`, `hypothesis`, `unknown`
- **confidence:** `confirmed`, `probable`, `possible`, `uncertain` (observed claims are assumed confirmed unless flagged as partial or unclear)

Example: *At 00:12 a red button is pressed (visual · observed). The press may trigger the scene change at 00:13 (temporal · inferred · possible).*

For tiers that need segment IDs, use `S<segment>` for segments and `S<segment>-<n>` for items so claims can be cross-referenced. Full definitions are in `references/evidence-and-confidence.md`.

## Choosing the output

Pick the form from the request. Do not force every analysis into one template.

| Request | Output |
|---|---|
| Specific question | Direct answer, then timestamped evidence |
| "What is this / summarize" | Overview, key findings, condensed timeline |
| Shot or scene breakdown | Segment log (see `references/segment-schema.json`) |
| Transcript or text extraction | Verbatim, timestamped, completeness over fluency |
| Accessibility | Transcript, captions, audio description, clarity issues |
| Safety or moderation | Timestamped concerns with severity, described factually |
| Forensic / authenticity | Findings with confidence, manipulation indicators, caveats |
| Creative feedback | Description first, then craft analysis, then judgments labeled as evaluation |
| Tags, metadata, reusable rules | Structured output (JSON or the requested schema) |

Templates for the full report and each variant are in `references/outputs.md`. Lead with the answer; put the timeline and the limitations after it.

## Failure modes to avoid

- Inventing dialogue, text, or actions that were not present
- Reading blurry text as if it were clear
- Attributing speech to the wrong person, or to a visible person when the voice is off-screen
- Inferring emotion from one frame
- Mistaking edit order for real-world chronology
- Treating satire as literal, or staged content as spontaneous
- Ignoring silence or missing audio
- Focusing on appearance instead of action
- Missing repeated motifs
- Missing timestamps, or giving false precision
- Presenting speculation as fact
- Unnecessary identification of people or sensitive details

## Verification checklist

Before finalizing:

- Does every major claim map to a timestamp or segment?
- Are observations separated from inferences?
- Are quotes and on-screen text exact?
- Are missing modalities and sampling limits stated?
- Could editing, camera angle, or audio mixing mislead the reading?
- Do image, sound, and text contradict each other anywhere?
- Is any conclusion more confident than the evidence allows?
- Did I look for disconfirming evidence and alternative explanations?
- Does the output answer what the user actually asked?
