/**
 * ThumbnailGrid Component
 * 
 * Displays extracted video frames in a responsive grid layout.
 * 
 * Features:
 * - Responsive grid that adapts to container width
 * - Color-coded frame type badges (blue for keyframes, orange for scene changes)
 * - Flexible layout - expands to show all frames without fixed height
 */

import React from 'react';

// ============================================================================
// Type Definitions
// ============================================================================

export interface FrameData {
    path: string;
    type: 'keyframe' | 'scene';
    frame?: number;
    time?: number;
    pts?: number;
    description?: string;
}

interface ThumbnailGridProps {
    frames: FrameData[];
    onGenerateDescriptions: () => void;
    isDescribing: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
    frames,
    onGenerateDescriptions,
    isDescribing
}) => {

    if (frames.length === 0) {
        return (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                No frames extracted yet. Click "Run Extraction" to extract frames from your video.
            </div>
        );
    }

    return (
        <div>
            {/* Header Bar */}
            <div style={{
                padding: '10px 20px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#252526'
            }}>
                <span>Total Frames: {frames.length}</span>
                <button
                    onClick={onGenerateDescriptions}
                    disabled={isDescribing}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isDescribing ? 'wait' : 'pointer'
                    }}
                >
                    {isDescribing ? 'Generating...' : 'Generate AI Descriptions'}
                </button>
            </div>

            {/* Responsive Grid - no fixed height, expands freely */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '12px',
                padding: '15px'
            }}>
                {frames.map((frame, index) => (
                    <div
                        key={`${frame.path}-${index}`}
                        style={{
                            backgroundColor: '#222',
                            borderRadius: '8px',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Thumbnail */}
                        <div style={{ aspectRatio: '16/9', overflow: 'hidden', backgroundColor: '#000' }}>
                            <img
                                src={`file:///${frame.path.replace(/\\/g, '/')}`}
                                alt={`Frame ${frame.frame || index + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                        </div>

                        {/* Metadata */}
                        <div style={{ padding: '8px', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{
                                    backgroundColor: frame.type === 'keyframe' ? '#007AFF' : '#FF9500',
                                    color: 'white',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    fontSize: '0.65rem'
                                }}>
                                    {frame.type === 'keyframe' ? 'FRAME' : 'SCENE'}
                                </span>
                                <span style={{ color: '#aaa' }}>{frame.time?.toFixed(2)}s</span>
                            </div>

                            {frame.description && (
                                <div style={{ marginTop: '5px', color: '#ddd', fontSize: '0.75rem', lineHeight: '1.2' }}>
                                    {frame.description}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
