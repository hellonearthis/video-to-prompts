import React from 'react';
import './ThumbnailGrid.css';

// ============================================================================
// Type Definitions
// ============================================================================
// ... (FrameData and ThumbnailGridProps remain the same)
export interface FrameData {
    path: string;
    type: 'time' | 'keyframe' | 'scene' | 'scene_dual';
    frame?: number;
    time?: number;
    pts?: number;
    shotIdentifier?: string;
    pairRole?: 'start_15' | 'end_85';
    camera_movement?: string;
    rhythm_role?: string;
    /** AI-generated summary description */
    description?: string;
    /** AI-detected objects in frame */
    objects?: string[];
    /** AI-generated descriptive tags */
    tags?: string[];
    /** AI scene classification */
    scene_type?: string;
    /** AI visual analysis */
    visual_elements?: {
        dominant_colors: string[];
        lighting: string;
    };
    /** Whether this frame has been analyzed */
    isAnalyzed?: boolean;
    /** Error message if analysis failed */
    analysisError?: string;
}

interface ThumbnailGridProps {
    frames: FrameData[];
    selectedIndices: Set<number>;
    onSelectionChange: (indices: Set<number>) => void;
    onAnalyzeStory: () => void;
    /** Callback to analyze selected frames individually */
    onAnalyzeFrames: () => void;
    isAnalyzing: boolean;
    analysisProgress?: { current: number; total: number };
    hasAnalyzedFrames: boolean;
    hiddenPaths: Set<string>;
    showHidden: boolean;
    onUnhide: (path: string) => void;
    showExtractionPanel: boolean;
    onToggleExtractionPanel: () => void;
    onHideSelected: () => void;
    onToggleShowHidden: () => void;

    // AI controls
    availablePrompts: string[];
    selectedPrompt: string;
    onPromptChange: (val: string) => void;
    selectedModel: string;
    onModelChange: () => void;

    // New Modular Controls
    availableStyles: string[];
    selectedStyle: string;
    onStyleChange: (val: string) => void;
    availableRefinements: string[];
    selectedRefinement: string;
    onRefinementChange: (val: string) => void;
}


// ============================================================================
// Component Implementation
// ============================================================================

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
    frames,
    selectedIndices,
    onSelectionChange,
    onAnalyzeStory,
    onAnalyzeFrames,
    isAnalyzing,
    analysisProgress,
    hiddenPaths,
    showHidden,
    onUnhide,
    showExtractionPanel,
    onToggleExtractionPanel,
    onHideSelected,
    onToggleShowHidden,
    availablePrompts,
    selectedPrompt,
    onPromptChange,
    selectedModel,
    onModelChange,
    availableStyles,
    selectedStyle,
    onStyleChange,
    availableRefinements,
    selectedRefinement,
    onRefinementChange
}) => {

    // Handle frame click for selection
    const handleFrameClick = (index: number, event: React.MouseEvent) => {
        const newSelection = new Set(selectedIndices);

        if (event.ctrlKey || event.metaKey) {
            // Toggle selection with Ctrl/Cmd
            if (newSelection.has(index)) {
                newSelection.delete(index);
            } else {
                newSelection.add(index);
            }
        } else if (event.shiftKey && selectedIndices.size > 0) {
            // Range selection with Shift
            const lastSelected = Math.max(...selectedIndices);
            const start = Math.min(lastSelected, index);
            const end = Math.max(lastSelected, index);
            for (let i = start; i <= end; i++) {
                newSelection.add(i);
            }
        } else {
            // Single selection (clear others)
            newSelection.clear();
            newSelection.add(index);
        }

        onSelectionChange(newSelection);
    };

    // Select/deselect all
    const handleSelectAll = () => {
        if (selectedIndices.size === frames.length) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(frames.map((_, i) => i)));
        }
    };

    if (frames.length === 0) {
        return (
            <div className="thumbnail-grid-empty">
                No frames extracted yet. Click "Run Extraction" to extract frames from your video.
            </div>
        );
    }

    const analyzedCount = frames.filter(f => f.isAnalyzed).length;

    return (
        <div>
            {/* Header Bar */}
            <div className="thumbnail-grid-header">
                <div className="header-stats">
                    <span>Total: {frames.length}</span>
                    <span className="stats-separator">|</span>
                    <span>Selected: {selectedIndices.size}</span>
                    <span className="stats-separator">|</span>
                    <span className="stats-analyzed">Analyzed: {analyzedCount}</span>
                </div>

                <div className="header-ai-controls">
                    <div className="ai-control-item">
                        <label>Prompt:</label>
                        <select
                            value={selectedPrompt}
                            onChange={(e) => onPromptChange(e.target.value)}
                            className="header-select"
                            disabled={isAnalyzing}
                        >
                            {availablePrompts.length === 0 && <option value="Default">Default</option>}
                            {Array.isArray(availablePrompts) && availablePrompts.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <div className="ai-control-item">
                        <label>AI:</label>
                        <button
                            onClick={onModelChange}
                            disabled={isAnalyzing}
                            className="btn-header-model"
                        >
                            {selectedModel}
                        </button>
                    </div>

                    {/* Style Dropdown */}
                    {availableStyles && availableStyles.length > 0 && (
                        <div className="ai-control-item">
                            <label>Style:</label>
                            <select
                                value={selectedStyle}
                                onChange={(e) => onStyleChange(e.target.value)}
                                className="header-select"
                                disabled={isAnalyzing}
                                style={{ width: '100px' }}
                            >
                                <option value="">None</option>
                                {availableStyles.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Refinement Dropdown */}
                    {availableRefinements && availableRefinements.length > 0 && (
                        <div className="ai-control-item">
                            <label>Check:</label>
                            <select
                                value={selectedRefinement}
                                onChange={(e) => onRefinementChange(e.target.value)}
                                className="header-select"
                                disabled={isAnalyzing}
                                style={{ width: '100px' }}
                            >
                                <option value="">None</option>
                                {availableRefinements.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="header-actions">
                    {/* Toggle Extraction Panel */}
                    <button
                        onClick={onToggleExtractionPanel}
                        className={`btn-toggle-extraction ${showExtractionPanel ? 'active' : ''}`}
                        title={showExtractionPanel ? "Hide Extraction Panel" : "Show Extraction Panel"}
                    >
                        ⚙️ {showExtractionPanel ? 'Hide Controls' : 'Extraction Controls'}
                    </button>

                    {/* Divider */}
                    <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px' }}></div>

                    {/* Visibility Controls */}
                    <button
                        onClick={onHideSelected}
                        disabled={selectedIndices.size === 0}
                        className="btn-select-all"
                        style={{ border: '1px solid #666', color: selectedIndices.size > 0 ? '#ffb74d' : '#666' }}
                        title="Hide selected frames"
                    >
                        Hide Selected {selectedIndices.size > 0 ? `(${selectedIndices.size})` : ''}
                    </button>

                    <label className="checkbox-label" style={{ fontSize: '0.8rem', color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input
                            type="checkbox"
                            checked={showHidden}
                            onChange={onToggleShowHidden}
                        />
                        Show Hidden ({hiddenPaths.size})
                    </label>

                    {/* Divider */}
                    <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px' }}></div>

                    {/* Progress indicator */}
                    {isAnalyzing && analysisProgress && (
                        <span className="analysis-progress-text">
                            Analyzing {analysisProgress.current}/{analysisProgress.total}...
                        </span>
                    )}

                    <button
                        onClick={handleSelectAll}
                        className="btn-select-all"
                    >
                        {selectedIndices.size === frames.length ? 'Deselect All' : 'Select All'}
                    </button>

                    <button
                        onClick={onAnalyzeFrames}
                        disabled={selectedIndices.size === 0 || isAnalyzing}
                        className={`btn-analyze-frames ${selectedIndices.size > 0 && !isAnalyzing ? 'active' : 'disabled'}`}
                    >
                        Analyze Item(s)
                    </button>

                    <button
                        onClick={onAnalyzeStory}
                        disabled={selectedIndices.size < 2 || isAnalyzing}
                        className={`btn-analyze-story ${selectedIndices.size >= 2 && !isAnalyzing ? 'active' : 'disabled'}`}
                        title="Select at least 2 frames for narrative analysis"
                    >
                        Analyze Story
                    </button>
                </div>
            </div>

            {/* Responsive Grid */}
            <div className="thumbnail-grid-layout">
                {frames.map((frame, index) => {
                    if (!frame || !frame.path) return null;

                    const isSelected = selectedIndices.has(index);
                    const isHidden = hiddenPaths.has(frame.path);

                    // Skip if hidden and not showing hidden
                    if (isHidden && !showHidden) return null;

                    return (
                        <div
                            key={`${frame.path}-${index}`}
                            onClick={(e) => handleFrameClick(index, e)}
                            className={`frame-card ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden-frame' : ''}`}
                            style={isHidden ? { opacity: 0.5, filter: 'grayscale(100%)' } : {}}
                        >
                            {/* Hidden Indicator / Unhide Button */}
                            {isHidden && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUnhide(frame.path);
                                    }}
                                    className="btn-unhide"
                                    title="Click to Unhide"
                                    style={{
                                        position: 'absolute',
                                        top: 5,
                                        right: 5,
                                        zIndex: 10,
                                        background: 'rgba(0,0,0,0.7)',
                                        color: 'white',
                                        border: '1px solid #666',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        padding: '2px 6px',
                                        fontSize: '12px'
                                    }}
                                >
                                    (H)
                                </button>
                            )}
                            {/* Thumbnail */}
                            <div className="frame-thumbnail-container">
                                <img
                                    src={`file:///${frame.path.replace(/\\/g, '/')}`}
                                    alt={`Frame ${frame.frame || index + 1}`}
                                    className="frame-img"
                                />

                                {/* Selection indicator */}
                                {isSelected && (
                                    <div className="selection-indicator">
                                        ✓
                                    </div>
                                )}

                                {/* Analysis status indicator */}
                                {frame.isAnalyzed && (
                                    <div className="ai-status-badge">
                                        AI ✓
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className="frame-meta-content">
                                <div className="meta-header-row">
                                    <span className="frame-timestamp">
                                        {frame.shotIdentifier ? `${frame.shotIdentifier}${frame.pairRole === 'start_15' ? 'a (15%)' : 'b (85%)'}` : `Frame ${index + 1}`} {frame.time !== undefined ? `- ${frame.time.toFixed(2)}s` : ''}
                                    </span>
                                </div>

                                {/* AI Analysis Results */}
                                {frame.isAnalyzed && (
                                    <div className="ai-analysis-results">
                                        {/* Summary */}
                                        {frame.description && (
                                            <div className="analysis-description-container">
                                                <div className="description-header">
                                                    <span className="description-label">Description</span>
                                                    <button
                                                        className="btn-copy-description"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(frame.description || '');
                                                        }}
                                                        title="Copy explanation to clipboard"
                                                    >
                                                        📋 Copy
                                                    </button>
                                                </div>
                                                <div className="analysis-description">
                                                    {frame.description}
                                                </div>
                                            </div>
                                        )}

                                        {/* Scene Type & Cinematic Rhythm / Camera Badges */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                            {frame.scene_type && (
                                                <span className="scene-type-badge">
                                                    {frame.scene_type}
                                                </span>
                                            )}
                                            {frame.rhythm_role && (
                                                <span className="scene-type-badge" style={{ background: '#2e4372', color: '#c9daf8', border: '1px solid #4a70be' }} title="Reelbench Cinematic Pacing Beat">
                                                    🎵 {frame.rhythm_role}
                                                </span>
                                            )}
                                            {frame.camera_movement && (
                                                <span className="scene-type-badge" style={{ background: '#254e33', color: '#b7e1cd', border: '1px solid #3e8453' }} title="Camera Movement">
                                                    📹 {frame.camera_movement}
                                                </span>
                                            )}
                                        </div>

                                        {/* Objects */}
                                        {frame.objects && frame.objects.length > 0 && (
                                            <div className="analysis-tag-list">
                                                {frame.objects.slice(0, 5).map((obj, i) => (
                                                    <span key={i} className="object-badge">
                                                        {obj}
                                                    </span>
                                                ))}
                                                {frame.objects.length > 5 && (
                                                    <span className="more-count">
                                                        +{frame.objects.length - 5}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {frame.tags && frame.tags.length > 0 && (
                                            <div className="analysis-tag-list">
                                                {frame.tags.slice(0, 5).map((tag, i) => (
                                                    <span key={i} className="tag-badge">
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {frame.tags.length > 5 && (
                                                    <span className="more-count">
                                                        +{frame.tags.length - 5}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Analysis Error */}
                                {frame.analysisError && (
                                    <div className="analysis-error-msg">
                                        ⚠ {frame.analysisError}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
