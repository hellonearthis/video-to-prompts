import React, { useEffect, useState, useRef } from 'react';
import './StoryboardView.css';

interface StoryboardViewProps {
    isOpen: boolean;
    onClose: () => void;
    framePaths: string[];
    onSaveToTimeline: (analysis: SceneAnalysis) => void;
    onExport: (analysis: SceneAnalysis) => void;
    initialAnalysis?: SceneAnalysis | null;
    onAnalysisComplete?: (analysis: SceneAnalysis) => void;
    timeline: SceneAnalysis[];
}

export interface SceneAnalysis {
    scene_id: string;
    summary: {
        what_happened: string;
        change: string;
        implied: string;
        uncertainty: string;
    };
    key_entities: Array<{
        name: string;
        type: "person" | "object" | "animal";
        role: "protagonist" | "antagonist" | "context";
        description: string;
    }>;
    story_signals: {
        importance: number;
        agency: string;
        irreversible: boolean;
        emotional_shift: { from: string; to: string };
    };
    panel_guidance: {
        panel_count: number;
        panel_roles: string[];
        omit_literal_action: boolean;
        panels: Array<{
            panel_index: number;
            role: string;
            description: string;
            best_frame_index: number;
        }>;
    };
    confidence: number;
    frames?: string[];
    timestamp?: string;
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
    isOpen, onClose, framePaths, onSaveToTimeline, onExport, initialAnalysis, onAnalysisComplete, timeline
}) => {
    const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [editingPanelIndex, setEditingPanelIndex] = useState<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialAnalysis) {
                setAnalysis(initialAnalysis);
                setLoading(false);
                setError(null);
            } else if (framePaths.length > 0) {
                analyzeStory();
            }
        } else {
            // Cleanup states and timer when closing
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setElapsedTime(0);
            setLoading(false);
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isOpen, framePaths, initialAnalysis]);

    const analyzeStory = async () => {
        // Clear any existing timer before starting
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        setLoading(true);
        setError(null);
        setAnalysis(null);
        setElapsedTime(0);

        const startTime = Date.now();
        timerRef.current = setInterval(() => {
            setElapsedTime(Math.round((Date.now() - startTime) / 1000));
        }, 1000);

        try {
            console.log("Starting analysis for frames:", framePaths);
            const result = await window.ipcRenderer.analyzeStorySequence(framePaths);
            if (result.success && result.analysis) {
                const enrichedAnalysis: SceneAnalysis = {
                    ...result.analysis,
                    frames: framePaths,
                    timestamp: new Date().toISOString()
                };
                setAnalysis(enrichedAnalysis);
                onAnalysisComplete?.(enrichedAnalysis);
            } else {
                setError(result.error || "Failed to analyze story");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setLoading(false);
        }
    };

    const handleFrameSelect = (frameIdx: number) => {
        if (editingPanelIndex === null || !analysis) return;

        const newAnalysis = { ...analysis };
        newAnalysis.panel_guidance = { ...newAnalysis.panel_guidance };
        newAnalysis.panel_guidance.panels = [...newAnalysis.panel_guidance.panels];
        newAnalysis.panel_guidance.panels[editingPanelIndex] = {
            ...newAnalysis.panel_guidance.panels[editingPanelIndex],
            best_frame_index: frameIdx
        };

        setAnalysis(newAnalysis);
        onAnalysisComplete?.(newAnalysis);
        setEditingPanelIndex(null);
    };

    const getRoleClass = (role: string) => {
        const r = role.toLowerCase();
        if (r.includes('reveal')) return 'role-reveal';
        if (r.includes('reaction')) return 'role-reaction';
        if (r.includes('action')) return 'role-action';
        if (r.includes('setup') || r.includes('atmosphere') || r.includes('context')) return 'role-setup';
        return '';
    };

    if (!isOpen) return null;

    return (
        <div className="storyboard-overlay">
            <div className="storyboard-container">
                <div className="storyboard-header">
                    <h2>Narrative Storyboard</h2>
                    <div className="header-actions">
                        <button
                            onClick={analyzeStory}
                            disabled={loading}
                            className="btn-secondary"
                        >
                            {loading ? 'Analyzing...' : '🔄 Re-analyze'}
                        </button>
                        {analysis && (
                            <>
                                <button
                                    onClick={() => onExport(analysis)}
                                    className="btn-primary btn-green"
                                >
                                    📥 Export JSON
                                </button>
                                <button
                                    onClick={() => {
                                        onSaveToTimeline(analysis);
                                        onClose();
                                    }}
                                    className="btn-primary btn-purple"
                                >
                                    {timeline.some(s => s.scene_id === analysis.scene_id) ? '💾 Update Timeline' : '💾 Add to Timeline'}
                                </button>
                            </>
                        )}
                        <div className="header-divider" />
                        <button onClick={onClose} className="btn-secondary">
                            Close
                        </button>
                    </div>
                </div>

                <div className="storyboard-content">
                    {loading && (
                        <div className="loading-overlay">
                            <div className="spinner-container">
                                <div className="spinner" />
                                <div className="loading-timer">{elapsedTime}s</div>
                            </div>
                            <div className="loading-text-container">
                                <p className="loading-status">Analyzing Narrative Beats...</p>
                                <p className="loading-subtext">Processing {framePaths.length} frames with AI</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="error-box">
                            <h3>Analysis Failed</h3>
                            <p>{error}</p>
                            <button onClick={analyzeStory} className="btn-secondary">Retry</button>
                        </div>
                    )}

                    {analysis && (
                        <>
                            <div className="narrative-col">
                                <Section title="What Happened" className="role-setup">
                                    <p>{analysis.summary.what_happened}</p>
                                </Section>

                                <Section title="The Change" className="role-action">
                                    <p>{analysis.summary.change}</p>
                                    {analysis.story_signals.irreversible && (
                                        <Badge variant="irreversible">Irreversible Change</Badge>
                                    )}
                                </Section>

                                <Section title="Subtext & Implied" className="role-reaction">
                                    <p className="implied-text">"{analysis.summary.implied}"</p>
                                </Section>

                                <div className="metric-grid">
                                    <MetricBox label="Importance" value={analysis.story_signals.importance} max={10} />
                                    <MetricBox label="Confidence" value={Math.round(analysis.confidence * 100)} unit="%" />
                                </div>

                                <Section title="Emotional Shift" className="role-reveal">
                                    <div className="emotional-shift-container">
                                        <span className="shift-from">{analysis.story_signals.emotional_shift.from}</span>
                                        <span className="shift-arrow">➜</span>
                                        <span className="shift-to">{analysis.story_signals.emotional_shift.to}</span>
                                    </div>
                                </Section>

                                <Section title="Key Entities" className="role-setup">
                                    <div className="entity-list">
                                        {analysis.key_entities.map((entity, i) => (
                                            <div key={i} className={`entity-card role-${entity.role}`}>
                                                <div className="entity-header">
                                                    <span className="entity-name">{entity.name}</span>
                                                    <span className="entity-type">{entity.type}</span>
                                                </div>
                                                <div className="entity-desc">{entity.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            </div>

                            <div className="visual-col">
                                <div className="directors-cut-bar">
                                    <span className="director-label">AI Director's Cut</span>
                                    <div className="director-divider" />
                                    <span className="panel-count-label">Suggested Panels: <strong>{analysis.panel_guidance.panel_count}</strong></span>
                                </div>

                                <div className="panel-grid">
                                    {analysis.panel_guidance.panels.map((panel, idx) => {
                                        const framePath = framePaths[panel.best_frame_index] || framePaths[Math.min(idx, framePaths.length - 1)];
                                        const isReveal = panel.role.toLowerCase().includes('reveal');
                                        const roleClass = getRoleClass(panel.role);

                                        return (
                                            <div key={idx} className="panel-card">
                                                <div
                                                    onClick={() => setEditingPanelIndex(idx)}
                                                    className={`panel-image-container ${roleClass} ${isReveal ? 'role-reveal' : ''}`}
                                                >
                                                    <img
                                                        src={`file:///${framePath.replace(/\\/g, '/')}`}
                                                        className="panel-image"
                                                    />
                                                    <div className={`panel-badge ${isReveal ? 'reveal' : ''}`}>
                                                        {isReveal ? '🌟 REVEAL' : `Panel ${panel.panel_index + 1}`}
                                                        {!isReveal && <span className="role-label">| {panel.role}</span>}
                                                    </div>

                                                    {isReveal && (
                                                        <div className="climax-label">
                                                            Narrative Climax
                                                        </div>
                                                    )}

                                                    <div className="swap-label">
                                                        Click to swap frame
                                                    </div>
                                                </div>
                                                <div className="panel-description">
                                                    {panel.description}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {analysis.panel_guidance.omit_literal_action && (
                                    <div className="guidance-box guidance-creative">
                                        <strong>💡 Creative Note:</strong> The AI suggests <em>omitting the literal action</em> in favor of an implied or symbolic transition here.
                                    </div>
                                )}

                                {analysis.panel_guidance.panels.some(p => p.role.toLowerCase().includes('reveal')) && (
                                    <div className="guidance-box guidance-director">
                                        <strong>🎬 Director's Recommendation:</strong> To make the <em>Reveal</em> land harder, try swapping the preceding panel for a <strong>Reaction shot</strong> or a <strong>Symbolic detail</strong>. This creates a "Gutter Jump" that lets the reader's imagination do the work.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {editingPanelIndex !== null && (
                    <div className="picker-overlay">
                        <div className="picker-header">
                            <h3>Select Frame for Panel {editingPanelIndex + 1}</h3>
                            <button
                                onClick={() => setEditingPanelIndex(null)}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                        </div>
                        <div className="picker-grid">
                            {framePaths.map((fp, i) => (
                                <div
                                    key={i}
                                    onClick={() => handleFrameSelect(i)}
                                    className={`picker-frame ${analysis?.panel_guidance.panels[editingPanelIndex].best_frame_index === i ? 'selected' : ''}`}
                                >
                                    <img
                                        src={`file:///${fp.replace(/\\/g, '/')}`}
                                        className="picker-image"
                                    />
                                    <div className="frame-index-badge">
                                        Frame {i + 1}
                                    </div>
                                    {analysis?.panel_guidance.panels[editingPanelIndex].best_frame_index === i && (
                                        <div className="selection-check">
                                            ✓
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const Section: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({ title, className, children }) => (
    <div className={`narrative-section ${className || ''}`}>
        <h4 className="section-title">{title}</h4>
        <div className="section-content">{children}</div>
    </div>
);

const Badge: React.FC<{ variant?: 'irreversible'; children: React.ReactNode }> = ({ variant, children }) => (
    <span className={`narrative-badge ${variant ? `badge-${variant}` : ''}`}>
        {children}
    </span>
);

const MetricBox: React.FC<{ label: string; value: number; max?: number; unit?: string }> = ({ label, value, max, unit }) => (
    <div className="metric-box">
        <div className="metric-label">{label}</div>
        <div className="metric-value">
            {value}{unit}
            {max && <span className="metric-max">/{max}</span>}
        </div>
    </div>
);
