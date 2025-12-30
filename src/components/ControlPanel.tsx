import React from 'react';
import './ControlPanel.css';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Props for the ControlPanel component.
 */
interface ControlPanelProps {
    /** Frames per second to extract for time-based mode */
    fps: number;
    /** Number of frames currently extracted */
    framesCount: number;
    /** Callback to update fps value */
    setFps: (val: number) => void;

    /** Current scene detection threshold value (0.1 - 1.0) */
    threshold: number;
    /** Callback to update the threshold value */
    setThreshold: (val: number) => void;

    /** Whether time-based frame extraction is enabled */
    extractTimeFrames: boolean;
    /** Callback to toggle time-based extraction */
    setExtractTimeFrames: (val: boolean) => void;

    /** Whether keyframe (I-frame) extraction is enabled */
    extractKeyframes: boolean;
    /** Callback to toggle keyframe extraction */
    setExtractKeyframes: (val: boolean) => void;

    /** Whether scene change extraction is enabled */
    extractSceneChanges: boolean;
    /** Callback to toggle scene change extraction */
    setExtractSceneChanges: (val: boolean) => void;

    /** Callback triggered when Run Extraction button is clicked */
    onRunExtraction: () => void;

    /** Whether extraction is currently in progress */
    isProcessing: boolean;

    selectedModel: string;
    /** Callback to update selected model */
    onModelChange: () => void;
}

// ============================================================================
// Component Implementation
// ============================================================================

export const ControlPanel: React.FC<ControlPanelProps> = ({
    fps,
    setFps,
    threshold,
    setThreshold,
    extractTimeFrames,
    setExtractTimeFrames,
    extractKeyframes,
    setExtractKeyframes,
    extractSceneChanges,
    setExtractSceneChanges,
    onRunExtraction,
    isProcessing,
    selectedModel,
    onModelChange,
    framesCount
}) => {
    return (
        <div className="control-panel-container">

            {/* --------------------------------------------------------------------------
          Frames Per Second Input
          -------------------------------------------------------------------------- */}
            <div className="control-group">
                <label htmlFor="fps" className="control-label">FPS (Time-based)</label>
                <input
                    id="fps"
                    type="number"
                    min="0.1"
                    max="30"
                    step="0.5"
                    value={fps}
                    onChange={(e) => setFps(parseFloat(e.target.value) || 1)}
                    disabled={isProcessing}
                    className="control-input-number"
                />
            </div>

            {/* --------------------------------------------------------------------------
          Scene Detection Threshold Slider
          -------------------------------------------------------------------------- */}
            <div className="control-group">
                <label htmlFor="threshold" className="control-label">
                    Scene Threshold: {threshold}
                </label>
                <input
                    id="threshold"
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    disabled={isProcessing}
                    className="control-input-range"
                />
            </div>

            {/* --------------------------------------------------------------------------
          Extraction Mode Checkboxes
          -------------------------------------------------------------------------- */}
            <div className="checkbox-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={extractTimeFrames}
                        onChange={(e) => setExtractTimeFrames(e.target.checked)}
                        disabled={isProcessing}
                    />
                    Time Frames
                </label>

                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={extractKeyframes}
                        onChange={(e) => setExtractKeyframes(e.target.checked)}
                        disabled={isProcessing}
                    />
                    Keyframes
                </label>

                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={extractSceneChanges}
                        onChange={(e) => setExtractSceneChanges(e.target.checked)}
                        disabled={isProcessing}
                    />
                    Scene Changes
                </label>
            </div>

            {/* --------------------------------------------------------------------------
              AI Model / API Status
              -------------------------------------------------------------------------- */}
            <div className="control-group">
                <label className="control-label">AI Engine</label>
                <button
                    onClick={onModelChange}
                    disabled={isProcessing}
                    className="btn-model-refresh"
                >
                    {selectedModel} (Refresh)
                </button>
            </div>

            {/* --------------------------------------------------------------------------
          Run Extraction Button
          -------------------------------------------------------------------------- */}
            <div className="action-group">
                <button
                    onClick={onRunExtraction}
                    disabled={isProcessing || (!extractTimeFrames && !extractKeyframes && !extractSceneChanges)}
                    className="btn-run-extraction"
                >
                    {isProcessing ? 'Extracting...' : 'Run Extraction'}
                </button>
            </div>
        </div>
    );
};
