import React from 'react';
import './ThumbnailGrid.css';

// ============================================================================
// Type Definitions
// ============================================================================
// ... (FrameData and ThumbnailGridProps remain the same)
export interface FrameData {
    path: string;
    type: 'time' | 'keyframe' | 'scene';
    frame?: number;
    time?: number;
    pts?: number;
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
    isDescribing: boolean;
    analysisProgress?: { current: number; total: number };
    hasAnalyzedFrames: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
    frames,
    selectedIndices,
    onSelectionChange,
    onAnalyzeStory,
    isDescribing,
    analysisProgress,
    hasAnalyzedFrames
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

                <div className="header-actions">
                    {/* Progress indicator */}
                    {isDescribing && analysisProgress && (
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
                        onClick={onAnalyzeStory}
                        disabled={selectedIndices.size < 2 || isDescribing}
                        className={`btn-analyze-story ${selectedIndices.size >= 2 && !isDescribing ? 'active' : 'disabled'}`}
                        title="Select at least 2 frames for narrative analysis"
                    >
                        Analyze Story
                    </button>
                </div>
            </div>

            {/* Responsive Grid */}
            <div className="thumbnail-grid-layout">
                {frames.map((frame, index) => {
                    const isSelected = selectedIndices.has(index);

                    if (!frame || !frame.path) return null;

                    return (
                        <div
                            key={`${frame.path}-${index}`}
                            onClick={(e) => handleFrameClick(index, e)}
                            className={`frame-card ${isSelected ? 'selected' : ''}`}
                        >
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
                                    <span className={`frame-type-badge type-${frame.type}`}>
                                        {frame.type}
                                    </span>
                                    <span className="frame-timestamp">
                                        {frame.time !== undefined ? `${frame.time.toFixed(2)}s` : ''}
                                    </span>
                                </div>

                                {/* AI Analysis Results */}
                                {frame.isAnalyzed && (
                                    <div className="ai-analysis-results">
                                        {/* Summary */}
                                        {frame.description && (
                                            <div className="analysis-description">
                                                {frame.description}
                                            </div>
                                        )}

                                        {/* Scene Type */}
                                        {frame.scene_type && (
                                            <div>
                                                <span className="scene-type-badge">
                                                    {frame.scene_type}
                                                </span>
                                            </div>
                                        )}

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
