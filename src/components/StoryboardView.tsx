import React, { useEffect, useState } from 'react';

interface StoryboardViewProps {
    isOpen: boolean;
    onClose: () => void;
    framePaths: string[];
    onSaveToTimeline: (analysis: SceneAnalysis) => void;
    onExport: (analysis: SceneAnalysis) => void;
    initialAnalysis?: SceneAnalysis | null;
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
    };
    confidence: number;
    // Client-side metadata (added during analysis)
    frames?: string[];
    timestamp?: string;
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
    isOpen, onClose, framePaths, onSaveToTimeline, onExport, initialAnalysis
}) => {
    const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialAnalysis) {
                setAnalysis(initialAnalysis);
                // Ensure no error/loading state lingers
                setLoading(false);
                setError(null);
            } else if (framePaths.length > 0) {
                // Only analyze if no initial analysis provided
                analyzeStory();
            }
        }
    }, [isOpen, framePaths, initialAnalysis]);

    const analyzeStory = async () => {
        setLoading(true);
        setError(null);
        setAnalysis(null);
        try {
            console.log("Starting analysis for frames:", framePaths);
            const result = await window.ipcRenderer.analyzeStorySequence(framePaths);
            if (result.success && result.analysis) {
                // Enrich analysis with local metadata
                const enrichedAnalysis: SceneAnalysis = {
                    ...result.analysis,
                    frames: framePaths,
                    timestamp: new Date().toISOString()
                };
                setAnalysis(enrichedAnalysis);
            } else {
                setError(result.error || "Failed to analyze story");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 3000,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(5px)'
        }}>
            <div style={{
                width: '90%', maxWidth: '1400px', height: '90vh',
                backgroundColor: '#1a1a1a', borderRadius: '16px',
                border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 30px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(to right, #1a1a1a, #252525)'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.2em' }}>🎬</span> Narrative Storyboard
                        </h2>
                        <span style={{ color: '#888', fontSize: '0.9rem' }}>
                            Analyzing {framePaths.length} frames as a coherent scene
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        {analysis && (
                            <>
                                <button
                                    onClick={() => onExport(analysis)}
                                    style={{
                                        background: '#28a745', border: 'none', color: '#fff',
                                        padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
                                        fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    📥 Export JSON
                                </button>
                                <button
                                    onClick={() => {
                                        onSaveToTimeline(analysis);
                                        onClose();
                                    }}
                                    style={{
                                        background: '#6f42c1', border: 'none', color: '#fff',
                                        padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
                                        fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    💾 Add to Timeline
                                </button>
                            </>
                        )}
                        <div style={{ width: '1px', backgroundColor: '#444', margin: '0 10px' }}></div>
                        <button onClick={onClose} style={{
                            background: 'none', border: '1px solid #444', color: '#fff',
                            padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}>
                            Close
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', gap: '30px' }}>

                    {loading && (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '20px' }}>
                            <div className="spinner" style={{
                                width: '50px', height: '50px', border: '3px solid #333',
                                borderTop: '3px solid #6f42c1', borderRadius: '50%', animation: 'spin 1s linear infinite'
                            }} />
                            <p style={{ color: '#888' }}>analyzing narrative beats...</p>
                            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {error && (
                        <div style={{ color: '#ff4444', padding: '20px', border: '1px solid #ff4444', borderRadius: '8px' }}>
                            <h3>Analysis Failed</h3>
                            <p>{error}</p>
                            <button onClick={analyzeStory} style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#333', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Retry</button>
                        </div>
                    )}

                    {analysis && (
                        <>
                            {/* Left Column: Narrative Summary */}
                            <div style={{ flex: '0 0 350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <Section title="What Happened" color="#6f42c1">
                                    <p style={{ margin: 0, lineHeight: 1.6 }}>{analysis.summary.what_happened}</p>
                                </Section>

                                <Section title="The Change" color="#2196f3">
                                    <p style={{ margin: 0, lineHeight: 1.6 }}>{analysis.summary.change}</p>
                                    {analysis.story_signals.irreversible && (
                                        <Badge color="#ff4444">Irreversible Change</Badge>
                                    )}
                                </Section>

                                <Section title="Subtext & Implied" color="#00bcd4">
                                    <p style={{ margin: 0, fontStyle: 'italic', color: '#aaa' }}>"{analysis.summary.implied}"</p>
                                </Section>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <MetricBox label="Importance" value={analysis.story_signals.importance} max={10} />
                                    <MetricBox label="Confidence" value={Math.round(analysis.confidence * 100)} unit="%" />
                                </div>

                                <Section title="Emotional Shift" color="#e91e63">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
                                        <span style={{ color: '#aaa' }}>{analysis.story_signals.emotional_shift.from}</span>
                                        <span>➜</span>
                                        <span style={{ color: '#fff', fontWeight: 'bold' }}>{analysis.story_signals.emotional_shift.to}</span>
                                    </div>
                                </Section>

                                <Section title="Key Entities" color="#ff9800">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {analysis.key_entities.map((entity, i) => (
                                            <div key={i} style={{
                                                backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '6px',
                                                borderLeft: `3px solid ${entity.role === 'protagonist' ? '#4caf50' : entity.role === 'antagonist' ? '#f44336' : '#9e9e9e'}`
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontWeight: '600' }}>{entity.name}</span>
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.7, textTransform: 'uppercase' }}>{entity.type}</span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '4px' }}>{entity.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            </div>

                            {/* Right Column: Visual Storyboard */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{
                                    padding: '15px', backgroundColor: '#252525', borderRadius: '8px',
                                    display: 'flex', gap: '15px', alignItems: 'center'
                                }}>
                                    <span style={{ color: '#888', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>AI Director's Cut</span>
                                    <div style={{ width: '1px', height: '20px', backgroundColor: '#444' }} />
                                    <span style={{ color: '#eee' }}>Suggested Panels: <strong>{analysis.panel_guidance.panel_count}</strong></span>
                                </div>

                                {/* Panel Layout Visualization */}
                                <div style={{
                                    flex: 1,
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${Math.min(analysis.panel_guidance.panels.length, 3)}, 1fr)`,
                                    gap: '20px',
                                    alignContent: 'start'
                                }}>
                                    {analysis.panel_guidance.panels.map((panel, idx) => {
                                        // Use the AI-selected frame index, or fallback to sequential if out of bounds
                                        const framePath = framePaths[panel.best_frame_index] || framePaths[Math.min(idx, framePaths.length - 1)];

                                        return (
                                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{
                                                    position: 'relative',
                                                    width: '100%',
                                                    // No forced aspect ratio - let the content define it, but max-height to keep it sane
                                                    maxHeight: '400px',
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    border: '2px solid #333',
                                                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                                                    backgroundColor: '#000', // Black bars for letterboxing
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center'
                                                }}>
                                                    <img
                                                        src={`file:///${framePath.replace(/\\/g, '/')}`}
                                                        style={{
                                                            maxWidth: '100%',
                                                            maxHeight: '100%',
                                                            width: 'auto',
                                                            height: 'auto',
                                                            objectFit: 'contain' // PREVENT CROPPING
                                                        }}
                                                    />
                                                    <div style={{
                                                        position: 'absolute', top: '10px', left: '10px',
                                                        padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.8)',
                                                        borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                                                    }}>
                                                        Panel {panel.panel_index + 1}: {panel.role}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.9rem', color: '#ccc', fontStyle: 'italic', padding: '0 5px' }}>
                                                    {panel.description}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {analysis.panel_guidance.omit_literal_action && (
                                    <div style={{ padding: '15px', backgroundColor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: '8px', color: '#ffcc80' }}>
                                        <strong>💡 Creative Note:</strong> The AI suggests <em>omitting the literal action</em> in favor of an implied or symbolic transition here.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Helper Components ---

const Section: React.FC<{ title: string; color: string; children: React.ReactNode }> = ({ title, color, children }) => (
    <div style={{ backgroundColor: '#252525', borderRadius: '10px', padding: '15px', borderLeft: `4px solid ${color}` }}>
        <h4 style={{ margin: '0 0 10px 0', color: color, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</h4>
        <div style={{ color: '#ddd' }}>{children}</div>
    </div>
);

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
    <span style={{
        display: 'inline-block', marginTop: '8px', padding: '4px 8px', borderRadius: '4px',
        fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: `${color}33`, color: color, border: `1px solid ${color}66`
    }}>
        {children}
    </span>
);

const MetricBox: React.FC<{ label: string; value: number; max?: number; unit?: string }> = ({ label, value, max, unit }) => (
    <div style={{ backgroundColor: '#252525', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '5px' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>
            {value}{unit}
            {max && <span style={{ fontSize: '1rem', color: '#555' }}>/{max}</span>}
        </div>
    </div>
);
