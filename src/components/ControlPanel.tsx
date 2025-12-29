/**
 * ControlPanel Component
 * 
 * A settings panel for configuring video frame extraction options.
 * 
 * Features:
 * - Frames per second (FPS) input for time-based extraction rate
 * - Scene detection threshold slider (0.1 - 1.0)
 * - Checkbox toggles for extraction modes:
 *   - Time Frames: Extract frames at regular time intervals
 *   - Keyframes: Extract actual video keyframes (I-frames)
 *   - Scene Changes: Extract frames where scene changes detected
 * - Run Extraction button with loading state
 * 
 * The panel is disabled during processing to prevent conflicting operations.
 */

import React from 'react';

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

    /** Currently selected AI model ID (Now fixed to LM Studio) */
    selectedModel: string;
    /** Callback to update selected model */
    onModelChange: () => void;
    /** Callback to trigger sequential flow analysis */
    onAnalyzeFlow: () => void;
    /** Whether flow analysis is in progress */
    isAnalyzingFlow: boolean;
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
    onAnalyzeFlow,
    isAnalyzingFlow,
    framesCount
}) => {
    return (
        <div style={{
            padding: '15px 20px',
            borderBottom: '1px solid #444',
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            flexWrap: 'wrap',
            backgroundColor: '#2d2d2d'
        }}>

            {/* --------------------------------------------------------------------------
          Frames Per Second Input
          
          Controls how many frames per second to extract in time-based mode.
          -------------------------------------------------------------------------- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label htmlFor="fps" style={{ fontSize: '0.8rem', color: '#aaa' }}>FPS (Time-based)</label>
                <input
                    id="fps"
                    type="number"
                    min="0.1"
                    max="30"
                    step="0.5"
                    value={fps}
                    onChange={(e) => setFps(parseFloat(e.target.value) || 1)}
                    disabled={isProcessing}
                    style={{
                        width: '60px',
                        padding: '4px 8px',
                        backgroundColor: '#1e1e1e',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#eee'
                    }}
                />
            </div>

            {/* --------------------------------------------------------------------------
          Scene Detection Threshold Slider
          -------------------------------------------------------------------------- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label htmlFor="threshold" style={{ fontSize: '0.8rem', color: '#aaa' }}>
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
                    style={{ width: '120px' }}
                />
            </div>

            {/* --------------------------------------------------------------------------
          Extraction Mode Checkboxes
          -------------------------------------------------------------------------- */}
            <div style={{ display: 'flex', gap: '15px' }}>
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                }}>
                    <input
                        type="checkbox"
                        checked={extractTimeFrames}
                        onChange={(e) => setExtractTimeFrames(e.target.checked)}
                        disabled={isProcessing}
                    />
                    Time Frames
                </label>

                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                }}>
                    <input
                        type="checkbox"
                        checked={extractKeyframes}
                        onChange={(e) => setExtractKeyframes(e.target.checked)}
                        disabled={isProcessing}
                    />
                    Keyframes
                </label>

                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>AI Engine</label>
                <button
                    onClick={onModelChange}
                    disabled={isProcessing}
                    style={{
                        padding: '4px 12px',
                        backgroundColor: '#1e1e1e',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#eee',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    {selectedModel} (Refresh)
                </button>
            </div>

            {/* --------------------------------------------------------------------------
          Run Extraction Button
          -------------------------------------------------------------------------- */}
            <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                <button
                    onClick={onAnalyzeFlow}
                    disabled={isProcessing || isAnalyzingFlow || framesCount < 2}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: (isProcessing || isAnalyzingFlow) ? '#555' : '#6f42c1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (isProcessing || isAnalyzingFlow) ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                    }}
                >
                    {isAnalyzingFlow ? 'Analyzing Flow...' : 'Analyze Flow'}
                </button>

                <button
                    onClick={onRunExtraction}
                    disabled={isProcessing || isAnalyzingFlow || (!extractTimeFrames && !extractKeyframes && !extractSceneChanges)}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: isProcessing ? '#555' : '#007AFF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                    }}
                >
                    {isProcessing ? 'Extracting...' : 'Run Extraction'}
                </button>
            </div>
        </div>
    );
};
