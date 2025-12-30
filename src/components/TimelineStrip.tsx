import React from 'react';
import { SceneAnalysis } from './StoryboardView';
import './TimelineStrip.css';

interface TimelineStripProps {
    timeline: SceneAnalysis[];
    onRemoveScene: (index: number) => void;
    onViewScene: (scene: SceneAnalysis) => void;
    onViewFullStoryboard: () => void;
}

export const TimelineStrip: React.FC<TimelineStripProps> = ({
    timeline,
    onRemoveScene,
    onViewScene,
    onViewFullStoryboard
}) => {
    if (timeline.length === 0) return null;

    return (
        <div className="timeline-strip-container">
            <div className="timeline-strip-header">
                <div className="timeline-strip-title">
                    <span>🎞️ Story Timeline</span>
                    <span className="timeline-strip-count">
                        {timeline.length} Scenes
                    </span>
                </div>
                <button
                    onClick={onViewFullStoryboard}
                    className="btn-view-storyboard"
                >
                    📖 View Full Storyboard
                </button>
            </div>

            <div className="timeline-strip-scroll">
                {timeline.map((scene, idx) => {
                    // Prioritize the Reveal frame for the thumbnail
                    const revealPanel = scene.panel_guidance.panels.find(p => p.role.toLowerCase().includes('reveal'));
                    const thumbnailIndex = revealPanel ? revealPanel.best_frame_index : 0;
                    const thumbnailPath = scene.frames?.[thumbnailIndex] || '';

                    return (
                        <div key={`${scene.scene_id}-${idx}`} className="scene-card">
                            {/* Remove Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveScene(idx);
                                }}
                                className="scene-remove-btn"
                                title="Remove from timeline"
                            >
                                ✕
                            </button>

                            {/* Thumbnail */}
                            <div
                                onClick={() => onViewScene(scene)}
                                className="scene-thumbnail-container"
                            >
                                {thumbnailPath ? (
                                    <img
                                        src={`file:///${thumbnailPath.replace(/\\/g, '/')}`}
                                        className="scene-thumbnail-img"
                                    />
                                ) : (
                                    <div className="scene-no-image">
                                        No Image
                                    </div>
                                )}
                                <div className="scene-frame-count">
                                    {scene.frames?.length || 0} Frames
                                </div>
                            </div>

                            {/* Info */}
                            <div className="scene-info">
                                <div className="scene-title">
                                    Scene {idx + 1}
                                </div>
                                <div className="scene-summary">
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
