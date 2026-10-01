# Output templates

Choose from the request. Lead with the answer. Keep these as shapes to fill, not mandatory sections.

## Full report (use for "analyze this" with no narrower ask, or exhaustive requests)

1. **Basis and limits.** What was available, sampling interval, timestamp precision, missing modalities.
2. **Overview.** One paragraph: what the video presents, form, tone as observed.
3. **Key findings.** 3-7 points, each tagged and timestamped.
4. **Timeline.** One line per segment: `start-end | label | visual | audio | text | notes`.
5. **Observations by channel.** Visual, audio, on-screen text, only where they add something beyond the timeline.
6. **Entities and relationships.** People (as labels), objects, places, interfaces, and how they relate or change.
7. **Cross-modal relations and patterns.**
8. **Candidate interpretations.** With support, opposition, alternatives, confidence.
9. **Unknowns.**
10. **Safety or policy notes** if relevant.
11. **Direct answers** to any specific questions the user asked.
12. **Next steps** if the media was incomplete (what would improve confidence).

## Specific question

Answer in the first sentence. Then: relevant timestamps, what was seen or heard there, and any missing context that limits certainty. No unrelated summary.

## Summary request

Overview first, key findings, a concise timeline. Mention limits in one line.

## Segment log / shot list

One record per segment using `segment-schema.json`. For plain text, one line per segment: timestamp, shot/event, camera, action, audio, text, transition.

## Transcript / text extraction

Verbatim, timestamped, speaker labels as neutral labels. Mark `[inaudible]`, `[unclear: ...]`. Do not clean up wording unless asked. Report on-screen text separately with timestamps and placement. Completeness over fluency.

## Accessibility report

Transcript or caption quality issues, speaker labeling, audio description script for visual-only information (what matters for understanding, in present tense, between speech where possible), text legibility and duration, flashing or high-contrast hazards, chapter markers, alt-text suggestions.

## Safety / moderation report

Per concern: timestamp, category, factual description, severity (low / medium / high) with the reason, context that may change the reading, and confidence. Observed conduct only; no legal conclusions.

## Forensic / authenticity report

Observed indicators with timestamps and confidence, alternative explanations (compression, filters, dubbing), what is not established, and what provenance would settle it. No definitive verdict from appearance alone.

## Creative feedback

Description of what is on screen and in the audio first. Then craft analysis (structure, pacing, composition, sound, clarity). Then judgments, labeled as evaluation, with reasons tied to timestamps. Suggest changes as options with their trade-offs.

## Tags / metadata / reusable rules

Return structured output in the requested schema. Keep tags to observed or high-confidence probable items; put interpretive tags in a separate list marked as such. When converting patterns into rules, cite the segments the pattern comes from and mark rules as derived from this video alone.
