import React from 'react';
import { SceneAnalysis } from './StoryboardView';
import './FullStoryboardView.css';

interface FullStoryboardViewProps {
    isOpen: boolean;
    onClose: () => void;
    timeline: SceneAnalysis[];
}

export const FullStoryboardView: React.FC<FullStoryboardViewProps> = ({ isOpen, onClose, timeline }) => {
    if (!isOpen) return null;

    const getRoleClass = (role: string) => {
        const r = role.toLowerCase();
        if (r.includes('reveal')) return 'role-reveal';
        if (r.includes('reaction')) return 'role-reaction';
        if (r.includes('action')) return 'role-action';
        if (r.includes('setup') || r.includes('atmosphere') || r.includes('context')) return 'role-setup';
        return '';
    };

    return (
        <div className="full-storyboard-overlay">
            <div className="full-storyboard-container">
                <div className="full-storyboard-header">
                    <h2>Continuous Narrative Storyboard</h2>
                    <div className="header-actions">
                        <button onClick={onClose} className="btn-secondary">
                            Close
                        </button>
                    </div>
                </div>

                <div className="full-storyboard-content">
                    {timeline.length === 0 ? (
                        <div className="empty-story-state">
                            <p>No scenes added to the timeline yet.</p>
                        </div>
                    ) : (
                        timeline.map((scene, sceneIdx) => (
                            <div key={scene.scene_id} className="story-scene-block">
                                <div className="scene-divider">
                                    <span className="scene-number">Scene {sceneIdx + 1}</span>
                                    <div className="scene-divider-line" />
                                </div>

                                <div className="scene-body">
                                    <div className="narrative-summary-full">
                                        <div className="summary-group role-setup">
                                            <h4>What Happened</h4>
                                            <p>{scene.summary.what_happened}</p>
                                        </div>
                                        <div className="summary-group role-action">
                                            <h4>The Change</h4>
                                            <p>{scene.summary.change}</p>
                                        </div>
                                        <div className="summary-group role-reaction">
                                            <h4>Subtext</h4>
                                            <p>{scene.summary.implied}</p>
                                        </div>
                                    </div>

                                    <div className="full-panel-grid">
                                        {scene.panel_guidance.panels.map((panel, pIdx) => {
                                            const frames = scene.frames || [];
                                            // Fallback logic: if best_frame_index is out of bounds, use the current loop index (clamped)
                                            const framePath = frames[panel.best_frame_index] || frames[Math.min(pIdx, frames.length - 1)] || '';
                                            const isReveal = panel.role.toLowerCase().includes('reveal');
                                            const roleClass = getRoleClass(panel.role);

                                            return (
                                                <div key={pIdx} className="full-panel-card">
                                                    <div className={`full-panel-img-container ${roleClass} ${isReveal ? 'role-reveal' : ''}`}>
                                                        {framePath && (
                                                            <img
                                                                src={`file:///${framePath.replace(/\\/g, '/')}`}
                                                                className="full-panel-img"
                                                                alt={panel.description}
                                                            />
                                                        )}
                                                        <div className={`full-panel-badge ${isReveal ? 'reveal' : ''}`}>
                                                            {isReveal ? '🌟 REVEAL' : `Panel ${panel.panel_index + 1}`}
                                                            {!isReveal && <span className="role-label"> | {panel.role}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="full-panel-desc">
                                                        {panel.description}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
