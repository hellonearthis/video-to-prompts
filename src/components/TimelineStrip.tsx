import React from 'react';
import { SceneAnalysis } from './StoryboardView';

interface TimelineStripProps {
    timeline: SceneAnalysis[];
    onRemoveScene: (index: number) => void;
    onViewScene: (scene: SceneAnalysis) => void;
}

export const TimelineStrip: React.FC<TimelineStripProps> = ({ timeline, onRemoveScene, onViewScene }) => {
    if (timeline.length === 0) return null;

    return (
        <div style={{
            width: '100%',
            backgroundColor: '#1e1e1e',
            borderBottom: '1px solid #333',
            padding: '10px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }}>
            <div style={{
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: '#aaa',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <span>🎞️ Story Timeline</span>
                <span style={{
                    backgroundColor: '#333',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontSize: '0.75rem'
                }}>
                    {timeline.length} Scenes
                </span>
            </div>

            <div style={{
                display: 'flex',
                gap: '15px',
                overflowX: 'auto',
                paddingBottom: '10px',
                scrollbarWidth: 'thin',
                alignItems: 'stretch'
            }}>
                {timeline.map((scene, idx) => {
                    // Try to get the first frame path from the scene data
                    const thumbnailPath = scene.frames?.[0] || '';

                    return (
                        <div key={`${scene.scene_id}-${idx}`} style={{
                            minWidth: '220px',
                            maxWidth: '220px',
                            backgroundColor: '#252526',
                            borderRadius: '8px',
                            border: '1px solid #333',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            flexShrink: 0
                        }}>
                            {/* Remove Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveScene(idx);
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '5px',
                                    right: '5px',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    zIndex: 10
                                }}
                                title="Remove from timeline"
                            >
                                ✕
                            </button>

                            {/* Thumbnail */}
                            <div
                                onClick={() => onViewScene(scene)}
                                style={{
                                    height: '100px',
                                    backgroundColor: '#000',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}
                            >
                                {thumbnailPath ? (
                                    <img
                                        src={`file:///${thumbnailPath.replace(/\\/g, '/')}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                                        No Image
                                    </div>
                                )}
                                <div style={{
                                    position: 'absolute',
                                    bottom: '0',
                                    left: '0',
                                    right: '0',
                                    padding: '4px 8px',
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                                    color: '#fff',
                                    fontSize: '0.7rem'
                                }}>
                                    {scene.frames?.length || 0} Frames
                                </div>
                            </div>

                            {/* Info */}
                            <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    color: '#ddd',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    Scene {idx + 1}
                                </div>
                                <div style={{
                                    fontSize: '0.7rem',
                                    color: '#aaa',
                                    lineHeight: '1.2',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {scene.summary.what_happened}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
