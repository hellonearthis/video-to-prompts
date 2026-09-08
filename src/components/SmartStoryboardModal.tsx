/**
 * ============================================================================
 * TUTORIAL: SMART STORYBOARD EXTRACTOR MODAL COMPONENT
 * ============================================================================
 * 
 * WHAT THIS COMPONENT DOES:
 * This React component provides the user interface for the autonomous
 * Agentic Storyboard Extractor. It guides the user through three distinct phases:
 * 
 * PHASE 1: CONFIGURATION
 *   - Allows configuring the target number of storyboard beats (2 to 6).
 *   - Provides a native file picker to attach an optional SubRip (.srt) transcript.
 *   - Displays an advisory warning if the video duration exceeds 5 minutes without a transcript.
 *   - Allows selecting the prompt synthesis style from qwen_vl3_prompts.json.
 * 
 * PHASE 2: REAL-TIME PROGRESS TRACKING (THE AGENT TERMINAL)
 *   - Listens to streaming IPC events from the Node.js main process (`agent-progress`).
 *   - Displays an animated heartbeat pulse indicator and elapsed timer.
 *   - Renders an auto-scrolling terminal console so the user can follow the agent's
 *     coarse scanning, candidate proposals, zoom decisions, and prompt generation.
 * 
 * PHASE 3: INTERACTIVE RESULTS & TIMELINE INTEGRATION
 *   - Displays responsive cards for each extracted beat with high-res thumbnails,
 *     exact [MM:SS] timecodes, reasons, and confidence badges.
 *   - Offers one-click copying of Midjourney/Flux/SD prompt tokens.
 *   - "Apply to Storyboard Timeline" button seamlessly transforms the results into
 *     a `SceneAnalysis` object, pushing it directly into `story_timeline.json` and
 *     opening the Full Storyboard view.
 */

import React, { useState, useEffect, useRef } from 'react';
import './SmartStoryboardModal.css';

/**
 * Data contract for an extracted storyboard beat.
 */
export interface StoryboardEntry {
  id: string;
  frameIndex: number;
  timestampSec: number;
  framePath: string;
  reason: string;
  description: string;
  promptText: string;
  confidence: 'high' | 'medium' | 'low';
  visualAnalysis?: {
    objects: string[];
    tags: string[];
    scene_type: string;
    visual_elements?: {
      dominant_colors: string[];
      lighting: string;
    };
  };
}

/**
 * Shape of real-time progress events pushed by electron/main.ts over IPC.
 */
export interface ExtractionProgressEvent {
  status:
    | 'coarse_pass'
    | 'candidates_found'
    | 'refining_candidate'
    | 'zoom_pass'
    | 'generating_prompt'
    | 'done'
    | 'error';
  message?: string;
  count?: number;
  index?: number;
  total?: number;
  reason?: string;
  approxTimestampSec?: number;
  candidateIndex?: number;
  iteration?: number;
  windowSec?: [number, number];
  timestampSec?: number;
  entries?: StoryboardEntry[];
}

/**
 * Props accepted by the SmartStoryboardModal component.
 */
interface SmartStoryboardModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Absolute path to the source video file on disk */
  videoPath: string;
  /** Directory where extracted frames and output JSON will be stored */
  outputDir: string;
  /** Total duration of the video in seconds */
  videoDuration: number;
  /** Available prompt presets loaded from qwen_vl3_prompts.json */
  availablePrompts: string[];
  /** Default prompt preset to pre-select */
  selectedPromptPreset: string;
  /** Callback that pushes extracted entries into the app's storyboard timeline */
  onApplyToTimeline: (entries: StoryboardEntry[]) => void;
}

export const SmartStoryboardModal: React.FC<SmartStoryboardModalProps> = ({
  isOpen,
  onClose,
  videoPath,
  outputDir,
  videoDuration,
  availablePrompts,
  selectedPromptPreset,
  onApplyToTimeline,
}) => {
  // --------------------------------------------------------------------------
  // User Configuration State
  // --------------------------------------------------------------------------
  const [targetCandidateCount, setTargetCandidateCount] = useState<number>(4);
  const [selectedPromptPresetName, setSelectedPromptPresetName] = useState<string>(
    selectedPromptPreset || 'Ultra Cinematic Detailed'
  );
  const [transcriptFileAbsolutePath, setTranscriptFileAbsolutePath] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Execution & Progress State
  // --------------------------------------------------------------------------
  const [isAgentLoopRunning, setIsAgentLoopRunning] = useState<boolean>(false);
  const [elapsedSecondsCounter, setElapsedSecondsCounter] = useState<number>(0);
  const [currentStageStatusText, setCurrentStageStatusText] = useState<string>('Ready to start');
  const [realtimeProgressLogLines, setRealtimeProgressLogLines] = useState<string[]>([]);
  const [extractedStoryboardResults, setExtractedStoryboardResults] = useState<StoryboardEntry[]>([]);
  const [errorMessageText, setErrorMessageText] = useState<string | null>(null);
  const [recentlyCopiedEntryId, setRecentlyCopiedEntryId] = useState<string | null>(null);

  // References for timing and DOM auto-scrolling
  const executionTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const terminalScrollAnchorRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the terminal log to the bottom whenever a new log line arrives
  useEffect(() => {
    terminalScrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [realtimeProgressLogLines]);

  // --------------------------------------------------------------------------
  // IPC Streaming Subscription
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    // Subscribe to streaming progress events emitted by the main process
    const removeProgressListener = window.ipcRenderer.on(
      'agent-progress',
      (_event: any, progressEventData: ExtractionProgressEvent) => {
        console.log('[AGENT_PROGRESS_EVENT]', progressEventData);

        if (progressEventData.status === 'coarse_pass') {
          const statusMessage = progressEventData.message || 'Scanning full video with coarse frames...';
          setCurrentStageStatusText(statusMessage);
          setRealtimeProgressLogLines(previousLogs => [...previousLogs, `[COARSE_SCAN] ${statusMessage}`]);
        } else if (progressEventData.status === 'candidates_found') {
          const statusMessage = `Identified ${progressEventData.count} potential narrative turning points`;
          setCurrentStageStatusText(statusMessage);
          setRealtimeProgressLogLines(previousLogs => [...previousLogs, `[PHASE_A_CANDIDATES] ${statusMessage}`]);
        } else if (progressEventData.status === 'refining_candidate') {
          const statusMessage = `Refining candidate ${progressEventData.index} of ${progressEventData.total}: "${progressEventData.reason}"`;
          setCurrentStageStatusText(statusMessage);
          setRealtimeProgressLogLines(previousLogs => [
            ...previousLogs,
            `[PHASE_B_REFINE] ${statusMessage} (Anchor: ~${progressEventData.approxTimestampSec?.toFixed(1)}s)`,
          ]);
        } else if (progressEventData.status === 'zoom_pass') {
          const statusMessage = `Zoom iteration #${progressEventData.iteration} on window [${progressEventData.windowSec?.[0].toFixed(1)}s - ${progressEventData.windowSec?.[1].toFixed(1)}s]`;
          setRealtimeProgressLogLines(previousLogs => [...previousLogs, `  ↳ ${statusMessage}`]);
        } else if (progressEventData.status === 'generating_prompt') {
          const statusMessage = `Synthesizing cinematic prompt tokens for frame at ${progressEventData.timestampSec?.toFixed(1)}s...`;
          setCurrentStageStatusText(statusMessage);
          setRealtimeProgressLogLines(previousLogs => [...previousLogs, `[PHASE_C_PROMPT] ${statusMessage}`]);
        } else if (progressEventData.status === 'done') {
          setIsAgentLoopRunning(false);
          if (executionTimerIntervalRef.current) clearInterval(executionTimerIntervalRef.current);
          setCurrentStageStatusText('Extraction complete!');
          setRealtimeProgressLogLines(previousLogs => [
            ...previousLogs,
            `[PIPELINE_COMPLETE] Successfully extracted ${progressEventData.entries?.length || 0} production beats.`,
          ]);
          if (progressEventData.entries) {
            setExtractedStoryboardResults(progressEventData.entries);
          }
        } else if (progressEventData.status === 'error') {
          setIsAgentLoopRunning(false);
          if (executionTimerIntervalRef.current) clearInterval(executionTimerIntervalRef.current);
          setErrorMessageText(progressEventData.message || 'An error occurred during extraction.');
          setRealtimeProgressLogLines(previousLogs => [
            ...previousLogs,
            `[PIPELINE_ERROR] ${progressEventData.message}`,
          ]);
        }
      }
    );

    return () => {
      if (removeProgressListener) removeProgressListener();
    };
  }, [isOpen]);

  /**
   * Opens the native OS file picker to select an SRT subtitle file.
   */
  const handleSelectTranscriptFile = async () => {
    try {
      const selectedFilePath = await window.ipcRenderer.selectTranscriptFile();
      if (selectedFilePath) {
        setTranscriptFileAbsolutePath(selectedFilePath);
      }
    } catch (dialogError) {
      console.error('[SMART_STORYBOARD_UI] Failed to select transcript file:', dialogError);
    }
  };

  /**
   * Initiates the autonomous extraction pipeline.
   */
  const handleStartExtraction = async () => {
    setIsAgentLoopRunning(true);
    setErrorMessageText(null);
    setExtractedStoryboardResults([]);
    setRealtimeProgressLogLines([]);
    setCurrentStageStatusText('Initializing autonomous agent loop...');
    setElapsedSecondsCounter(0);

    const executionStartTime = Date.now();
    executionTimerIntervalRef.current = setInterval(() => {
      setElapsedSecondsCounter(Math.floor((Date.now() - executionStartTime) / 1000));
    }, 1000);

    try {
      const extractionResponse = await window.ipcRenderer.extractAgenticStoryboard({
        videoPath,
        outputDir,
        transcriptPath: transcriptFileAbsolutePath,
        maxCandidates: targetCandidateCount,
        promptType: selectedPromptPresetName,
      });

      if (!extractionResponse.success && extractionResponse.error) {
        setErrorMessageText(extractionResponse.error);
        setIsAgentLoopRunning(false);
        if (executionTimerIntervalRef.current) clearInterval(executionTimerIntervalRef.current);
      } else if (extractionResponse.entries) {
        setExtractedStoryboardResults(extractionResponse.entries);
        setIsAgentLoopRunning(false);
        if (executionTimerIntervalRef.current) clearInterval(executionTimerIntervalRef.current);
      }
    } catch (error) {
      setErrorMessageText(error instanceof Error ? error.message : String(error));
      setIsAgentLoopRunning(false);
      if (executionTimerIntervalRef.current) clearInterval(executionTimerIntervalRef.current);
    }
  };

  /**
   * Copies the generated image-gen prompt text to the system clipboard.
   */
  const handleCopyPromptToClipboard = (entryId: string, promptTextToCopy: string) => {
    navigator.clipboard.writeText(promptTextToCopy);
    setRecentlyCopiedEntryId(entryId);
    setTimeout(() => setRecentlyCopiedEntryId(null), 2000);
  };

  if (!isOpen) return null;

  const isLongDurationVideo = videoDuration > 300;
  const durationMinutes = Math.floor(videoDuration / 60);
  const durationSeconds = Math.floor(videoDuration % 60);
  const formattedDurationString = `${durationMinutes}m ${durationSeconds}s`;

  return (
    <div className="agent-modal-overlay">
      <div className="agent-modal-container">
        {/* Modal Header */}
        <div className="agent-modal-header">
          <div className="agent-title-group">
            <h2>⚡ Smart Storyboard Extractor</h2>
            <span className="agent-badge">Agentic VLM Pipeline</span>
          </div>
          <button
            className="agent-close-btn"
            onClick={onClose}
            disabled={isAgentLoopRunning}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Advisory Warning: Long video without transcript */}
        {isLongDurationVideo && !transcriptFileAbsolutePath && (
          <div className="agent-warning-banner">
            <span className="warning-icon">⚠️</span>
            <div className="warning-text">
              <strong>Long Video Detected ({formattedDurationString})</strong>
              <p>
                Videos over 5 minutes have temporal gaps between visual coarse frames.
                Attaching a spoken dialogue transcript (.srt) from ComfyUI Qwen ASR is
                strongly recommended to ensure fast action beats are not missed.
              </p>
            </div>
          </div>
        )}

        {/* Configuration Panel (Shown when idle and results are empty) */}
        {!isAgentLoopRunning && extractedStoryboardResults.length === 0 && (
          <div className="agent-config-card">
            <div className="agent-config-grid">
              {/* Candidate Count Slider */}
              <div className="agent-input-group">
                <label>
                  Story Beats to Extract: <strong>{targetCandidateCount}</strong>
                </label>
                <input
                  type="range"
                  min="2"
                  max="6"
                  step="1"
                  value={targetCandidateCount}
                  onChange={(e) => setTargetCandidateCount(parseInt(e.target.value, 10))}
                  className="agent-slider"
                />
                <div className="slider-ticks">
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                  <span>6</span>
                </div>
              </div>

              {/* Prompt Preset Dropdown */}
              <div className="agent-input-group">
                <label>Prompt Synthesis Style:</label>
                <select
                  value={selectedPromptPresetName}
                  onChange={(e) => setSelectedPromptPresetName(e.target.value)}
                  className="agent-select"
                >
                  {availablePrompts.length > 0 ? (
                    availablePrompts.map((presetName) => (
                      <option key={presetName} value={presetName}>
                        {presetName}
                      </option>
                    ))
                  ) : (
                    <option value="Ultra Cinematic Detailed">Ultra Cinematic Detailed</option>
                  )}
                </select>
              </div>
            </div>

            {/* Transcript Selection Row */}
            <div className="agent-transcript-row">
              <label>Optional Spoken Dialogue Transcript (.srt):</label>
              <div className="transcript-input-wrapper">
                {transcriptFileAbsolutePath ? (
                  <div className="transcript-file-pill">
                    <span className="pill-icon">📄</span>
                    <span className="pill-path" title={transcriptFileAbsolutePath}>
                      {transcriptFileAbsolutePath.split(/[/\\]/).pop()}
                    </span>
                    <button
                      className="pill-remove-btn"
                      onClick={() => setTranscriptFileAbsolutePath(null)}
                      title="Remove attached transcript"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="agent-btn-secondary"
                    onClick={handleSelectTranscriptFile}
                  >
                    📂 Attach .SRT Transcript
                  </button>
                )}
                <span className="transcript-hint">
                  {transcriptFileAbsolutePath
                    ? 'Transcript linked and ready'
                    : 'Provides dialogue clues for scene changes'}
                </span>
              </div>
            </div>

            {/* Launch Action */}
            <div className="agent-actions-row">
              <button
                className="agent-btn-primary"
                onClick={handleStartExtraction}
                disabled={isAgentLoopRunning}
              >
                🚀 Run Smart Storyboard Extractor
              </button>
            </div>
          </div>
        )}

        {/* Live Execution Progress Card with Terminal Log */}
        {isAgentLoopRunning && (
          <div className="agent-progress-card">
            <div className="progress-header">
              <div className="progress-status-title">
                <div className="pulse-indicator"></div>
                <span>{currentStageStatusText}</span>
              </div>
              <div className="progress-timer">
                ⏱️ {elapsedSecondsCounter}s elapsed
              </div>
            </div>

            {/* Real-Time Agent Terminal View */}
            <div className="agent-terminal">
              {realtimeProgressLogLines.map((logLine, logIndex) => (
                <div key={logIndex} className="terminal-line">
                  {logLine}
                </div>
              ))}
              <div ref={terminalScrollAnchorRef} />
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMessageText && (
          <div className="agent-error-card">
            <strong>Extraction Error:</strong> {errorMessageText}
          </div>
        )}

        {/* Extracted Results Grid */}
        {extractedStoryboardResults.length > 0 && !isAgentLoopRunning && (
          <div className="agent-results-view">
            <div className="results-header-bar">
              <h3>Extracted Storyboard Beats ({extractedStoryboardResults.length})</h3>
              <div className="results-actions">
                <button
                  className="agent-btn-apply"
                  onClick={() => {
                    onApplyToTimeline(extractedStoryboardResults);
                    onClose();
                  }}
                >
                  ✨ Apply to Storyboard Timeline
                </button>
                <button
                  className="agent-btn-secondary"
                  onClick={() => {
                    setExtractedStoryboardResults([]);
                    setRealtimeProgressLogLines([]);
                  }}
                >
                  🔄 Run Another Extraction
                </button>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="agent-results-grid">
              {extractedStoryboardResults.map((entry, cardIndex) => {
                const beatMinutes = Math.floor(entry.timestampSec / 60);
                const beatSeconds = (entry.timestampSec % 60).toFixed(1);
                const timecodeString = `${beatMinutes.toString().padStart(2, '0')}:${beatSeconds.padStart(4, '0')}`;

                return (
                  <div key={entry.id || cardIndex} className="agent-entry-card">
                    <div className="entry-img-wrapper">
                      <img
                        src={`file:///${entry.framePath.replace(/\\/g, '/')}`}
                        alt={entry.reason}
                        onError={(imageErrorEvent) => {
                          // Fallback to custom protocol if file:// protocol is blocked
                          (imageErrorEvent.target as HTMLImageElement).src =
                            `local-file://${entry.framePath.replace(/\\/g, '/')}`;
                        }}
                      />
                      <span className="entry-timecode-tag">{timecodeString}s</span>
                      <span className={`entry-confidence-tag conf-${entry.confidence}`}>
                        {entry.confidence}
                      </span>
                    </div>

                    <div className="entry-body">
                      <h4 className="entry-reason">{entry.reason}</h4>
                      <p className="entry-description">{entry.description}</p>

                      {/* Visual Tags */}
                      {entry.visualAnalysis?.tags && entry.visualAnalysis.tags.length > 0 && (
                        <div className="entry-tags">
                          {entry.visualAnalysis.tags.slice(0, 4).map((tagString, tagIndex) => (
                            <span key={tagIndex} className="entry-tag-pill">
                              #{tagString}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Prompt Output Container */}
                      <div className="entry-prompt-box">
                        <div className="prompt-box-header">
                          <span>Prompt Tokens</span>
                          <button
                            className="btn-copy-prompt"
                            onClick={() => handleCopyPromptToClipboard(entry.id, entry.promptText)}
                          >
                            {recentlyCopiedEntryId === entry.id ? '✓ Copied' : '📋 Copy'}
                          </button>
                        </div>
                        <div className="prompt-text-content">
                          {entry.promptText}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
