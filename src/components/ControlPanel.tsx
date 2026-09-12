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
    /** Callback to update fps value */
    setFps: (val: number) => void;

    /** Current scene detection threshold value (0.1 - 1.0) */
    sceneDetectionThreshold: number;
    /** Callback to update the threshold value */
    setSceneDetectionThreshold: (val: number) => void;

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

    /** Whether Reelbench-style 15%/85% dual shot pair extraction is enabled */
    extractDualShotPairs?: boolean;
    /** Callback to toggle dual shot pair extraction */
    setExtractDualShotPairs?: (val: boolean) => void;

    /** Callback triggered when Run Extraction button is clicked */
    onRunExtraction: () => void;

    /** Whether extraction is currently in progress */
    isProcessing: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

export const ControlPanel: React.FC<ControlPanelProps> = ({
    fps,
    setFps,
    sceneDetectionThreshold,
    setSceneDetectionThreshold,
    extractTimeFrames,
    setExtractTimeFrames,
    extractKeyframes,
    setExtractKeyframes,
    extractSceneChanges,
    setExtractSceneChanges,
    extractDualShotPairs = false,
    setExtractDualShotPairs,
    onRunExtraction,
    isProcessing
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
                    Scene Threshold: {sceneDetectionThreshold}
                </label>
                <input
                    id="threshold"
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={sceneDetectionThreshold}
                    onChange={(e) => setSceneDetectionThreshold(parseFloat(e.target.value))}
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

                <label className="checkbox-label" title="Extract 15% Start (a) and 85% End (b) keyframe pairs per scene (Reelbench method for camera motion & action flow)">
                    <input
                        type="checkbox"
                        checked={extractDualShotPairs}
                        onChange={(e) => setExtractDualShotPairs && setExtractDualShotPairs(e.target.checked)}
                        disabled={isProcessing}
                    />
                    Dual-Frame (15%/85% A/B)
                </label>
            </div>

            {/* --------------------------------------------------------------------------
          Run Extraction Button
          -------------------------------------------------------------------------- */}
            <div className="action-group">
                <button
                    onClick={onRunExtraction}
                    disabled={isProcessing || (!extractTimeFrames && !extractKeyframes && !extractSceneChanges && !extractDualShotPairs)}
                    className="btn-run-extraction"
                >
                    {isProcessing ? 'Extracting...' : 'Run Extraction'}
                </button>
            </div>
        </div>
    );
};
