/**
 * ThumbnailGrid Component
 * 
 * Displays extracted video frames in a responsive grid layout with AI analysis.
 * 
 * Features:
 * - Responsive grid that adapts to container width
 * - Frame selection for targeted AI analysis
 * - Color-coded frame type badges:
 *   - Blue: Time-based frames (extracted at intervals)
 *   - Green: Keyframes (actual I-frames from video encoding)
 *   - Orange: Scene change frames
 * - AI analysis display (summary, objects, tags, scene type)
 * - Progress indicator during analysis
 */

import React from 'react';

// ============================================================================
// Type Definitions
// ============================================================================

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
    onAnalyzeSelected: () => void;
    onAnalyzeAll: () => void;
    onExportJson: () => void;
    onCompareSelected: () => void;
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
    onAnalyzeSelected,
    onAnalyzeAll,
    onExportJson,
    onCompareSelected,
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
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                No frames extracted yet. Click "Run Extraction" to extract frames from your video.
            </div>
        );
    }

    const analyzedCount = frames.filter(f => f.isAnalyzed).length;

    return (
        <div>
            {/* Header Bar */}
            <div style={{
                padding: '10px 20px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#252526',
                gap: '10px',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <span>Total: {frames.length}</span>
                    <span style={{ color: '#888' }}>|</span>
                    <span>Selected: {selectedIndices.size}</span>
                    <span style={{ color: '#888' }}>|</span>
                    <span style={{ color: '#4CAF50' }}>Analyzed: {analyzedCount}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Progress indicator */}
                    {isDescribing && analysisProgress && (
                        <span style={{
                            color: '#FFB74D',
                            fontSize: '0.85rem',
                            marginRight: '10px'
                        }}>
                            Analyzing {analysisProgress.current}/{analysisProgress.total}...
                        </span>
                    )}

                    <button
                        onClick={handleSelectAll}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: 'transparent',
                            color: '#aaa',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                        }}
                    >
                        {selectedIndices.size === frames.length ? 'Deselect All' : 'Select All'}
                    </button>

                    <button
                        onClick={onAnalyzeSelected}
                        disabled={isDescribing || selectedIndices.size === 0}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: selectedIndices.size > 0 ? '#2196F3' : '#555',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isDescribing || selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
                            opacity: isDescribing || selectedIndices.size === 0 ? 0.6 : 1
                        }}
                    >
                        Analyze Selected ({selectedIndices.size})
                    </button>

                    <button
                        onClick={onCompareSelected}
                        disabled={selectedIndices.size !== 2 || isDescribing}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: selectedIndices.size === 2 ? '#9C27B0' : '#555',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: selectedIndices.size !== 2 || isDescribing ? 'not-allowed' : 'pointer',
                            opacity: selectedIndices.size !== 2 || isDescribing ? 0.6 : 1
                        }}
                        title="Select exactly 2 frames to compare"
                    >
                        Compare Action
                    </button>

                    <button
                        onClick={onAnalyzeAll}
                        disabled={isDescribing}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isDescribing ? 'wait' : 'pointer',
                            opacity: isDescribing ? 0.6 : 1
                        }}
                    >
                        {isDescribing ? 'Analyzing...' : 'Analyze All'}
                    </button>

                    <button
                        onClick={onExportJson}
                        disabled={!hasAnalyzedFrames || isDescribing}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: hasAnalyzedFrames ? '#FF9800' : '#555',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: !hasAnalyzedFrames || isDescribing ? 'not-allowed' : 'pointer',
                            opacity: !hasAnalyzedFrames || isDescribing ? 0.6 : 1
                        }}
                    >
                        📄 Export JSON
                    </button>
                </div>
            </div>

            {/* Responsive Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
                padding: '15px'
            }}>
                {frames.map((frame, index) => {
                    const isSelected = selectedIndices.has(index);

                    return (
                        <div
                            key={`${frame.path}-${index}`}
                            onClick={(e) => handleFrameClick(index, e)}
                            style={{
                                backgroundColor: isSelected ? '#2a3a4a' : '#222',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: isSelected ? '2px solid #2196F3' : '2px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {/* Thumbnail */}
                            <div style={{
                                aspectRatio: '16/9',
                                overflow: 'hidden',
                                backgroundColor: '#000',
                                position: 'relative'
                            }}>
                                <img
                                    src={`file:///${frame.path.replace(/\\/g, '/')}`}
                                    alt={`Frame ${frame.frame || index + 1}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />

                                {/* Selection indicator */}
                                {isSelected && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '8px',
                                        width: '24px',
                                        height: '24px',
                                        backgroundColor: '#2196F3',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}>
                                        ✓
                                    </div>
                                )}

                                {/* Analysis status indicator */}
                                {frame.isAnalyzed && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '8px',
                                        left: '8px',
                                        backgroundColor: '#4CAF50',
                                        color: 'white',
                                        padding: '2px 6px',
                                        borderRadius: '3px',
                                        fontSize: '0.6rem'
                                    }}>
                                        AI ✓
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            <div style={{ padding: '8px', fontSize: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{
                                        backgroundColor: frame.type === 'time' ? '#007AFF'
                                            : frame.type === 'keyframe' ? '#28a745'
                                                : '#FF9500',
                                        color: 'white',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        fontSize: '0.65rem'
                                    }}>
                                        {frame.type === 'time' ? 'TIME'
                                            : frame.type === 'keyframe' ? 'KEYFRAME'
                                                : 'SCENE'}
                                    </span>
                                    <span style={{ color: '#aaa' }}>
                                        {frame.time !== undefined ? `${frame.time.toFixed(2)}s` : ''}
                                    </span>
                                </div>

                                {/* AI Analysis Results */}
                                {frame.isAnalyzed && (
                                    <div style={{ marginTop: '8px' }}>
                                        {/* Summary */}
                                        {frame.description && (
                                            <div style={{
                                                color: '#ddd',
                                                fontSize: '0.75rem',
                                                lineHeight: '1.3',
                                                marginBottom: '6px'
                                            }}>
                                                {frame.description}
                                            </div>
                                        )}

                                        {/* Scene Type */}
                                        {frame.scene_type && (
                                            <div style={{ marginBottom: '4px' }}>
                                                <span style={{
                                                    backgroundColor: '#9C27B0',
                                                    color: 'white',
                                                    padding: '1px 5px',
                                                    borderRadius: '3px',
                                                    fontSize: '0.6rem'
                                                }}>
                                                    {frame.scene_type}
                                                </span>
                                            </div>
                                        )}

                                        {/* Objects */}
                                        {frame.objects && frame.objects.length > 0 && (
                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: '3px',
                                                marginBottom: '4px'
                                            }}>
                                                {frame.objects.slice(0, 5).map((obj, i) => (
                                                    <span key={i} style={{
                                                        backgroundColor: '#3F51B5',
                                                        color: 'white',
                                                        padding: '1px 4px',
                                                        borderRadius: '2px',
                                                        fontSize: '0.6rem'
                                                    }}>
                                                        {obj}
                                                    </span>
                                                ))}
                                                {frame.objects.length > 5 && (
                                                    <span style={{ color: '#888', fontSize: '0.6rem' }}>
                                                        +{frame.objects.length - 5}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {frame.tags && frame.tags.length > 0 && (
                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: '3px'
                                            }}>
                                                {frame.tags.slice(0, 5).map((tag, i) => (
                                                    <span key={i} style={{
                                                        backgroundColor: '#455A64',
                                                        color: '#B0BEC5',
                                                        padding: '1px 4px',
                                                        borderRadius: '2px',
                                                        fontSize: '0.6rem'
                                                    }}>
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {frame.tags.length > 5 && (
                                                    <span style={{ color: '#888', fontSize: '0.6rem' }}>
                                                        +{frame.tags.length - 5}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Analysis Error */}
                                {frame.analysisError && (
                                    <div style={{
                                        color: '#f44336',
                                        fontSize: '0.7rem',
                                        marginTop: '5px'
                                    }}>
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
