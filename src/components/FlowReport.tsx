import React from 'react';

/**
 * Result of a single pair comparison in a sequential flow.
 */
interface FlowPairResult {
    index: number;
    frame1: string;
    frame2: string;
    comparison?: {
        action_description: string;
        object_flow: string;
        differences: string[];
    };
    error?: string;
}

interface FlowReportProps {
    results: FlowPairResult[];
    onClose: () => void;
    onExport: () => void;
}

/**
 * Component to display the sequential flow analysis report.
 */
export const FlowReport: React.FC<FlowReportProps> = ({ results, onClose, onExport }) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
            padding: '40px'
        }}>
            <div style={{
                backgroundColor: '#1a1a1a',
                width: '100%',
                maxWidth: '1200px',
                height: '90vh',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid #333',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 30px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#eee' }}>Sequential Flow Analysis</h2>
                        <div style={{ fontSize: '0.9rem', color: '#888', marginTop: '4px' }}>
                            {results.length} transitions analyzed
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button
                            onClick={onExport}
                            style={{
                                padding: '8px 20px',
                                backgroundColor: '#6f42c1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            Export JSON Report
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 20px',
                                backgroundColor: '#333',
                                color: '#eee',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '30px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '40px'
                }}>
                    {results.map((pair, idx) => (
                        <div key={idx} style={{
                            backgroundColor: '#252525',
                            borderRadius: '10px',
                            padding: '25px',
                            border: '1px solid #444'
                        }}>
                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                marginBottom: '20px',
                                alignItems: 'center'
                            }}>
                                <div style={{ position: 'relative' }}>
                                    <span style={{
                                        position: 'absolute', top: -10, left: -10,
                                        backgroundColor: '#007AFF', color: 'white',
                                        fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px',
                                        zIndex: 1
                                    }}>F{idx + 1}</span>
                                    <img
                                        src={`file:///${pair.frame1.replace(/\\/g, '/')}`}
                                        alt={`Frame ${idx + 1}`}
                                        style={{ width: '150px', height: '85px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #555' }}
                                    />
                                </div>
                                <div style={{ color: '#888', fontSize: '1.5rem' }}>→</div>
                                <div style={{ position: 'relative' }}>
                                    <span style={{
                                        position: 'absolute', top: -10, left: -10,
                                        backgroundColor: '#007AFF', color: 'white',
                                        fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px',
                                        zIndex: 1
                                    }}>F{idx + 2}</span>
                                    <img
                                        src={`file:///${pair.frame2.replace(/\\/g, '/')}`}
                                        alt={`Frame ${idx + 2}`}
                                        style={{ width: '150px', height: '85px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #555' }}
                                    />
                                </div>
                                <div style={{ marginLeft: '20px' }}>
                                    <h3 style={{ margin: 0, color: '#6f42c1' }}>Transition {idx + 1} to {idx + 2}</h3>
                                </div>
                            </div>

                            {pair.error ? (
                                <div style={{ color: '#f44336', backgroundColor: 'rgba(244, 67, 54, 0.1)', padding: '15px', borderRadius: '6px' }}>
                                    <strong>Error:</strong> {pair.error}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                    <div>
                                        <h4 style={{ color: '#aaa', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Action & Flow</h4>
                                        <p style={{ margin: 0, color: '#eee', lineHeight: '1.5' }}>{pair.comparison?.action_description}</p>

                                        <h4 style={{ color: '#aaa', fontSize: '0.85rem', textTransform: 'uppercase', marginTop: '20px', marginBottom: '8px' }}>Object Movement</h4>
                                        <p style={{ margin: 0, color: '#eee', lineHeight: '1.5' }}>{pair.comparison?.object_flow}</p>
                                    </div>
                                    <div>
                                        <h4 style={{ color: '#aaa', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Key Differences</h4>
                                        <ul style={{ margin: 0, paddingLeft: '20px', color: '#eee' }}>
                                            {pair.comparison?.differences?.map((diff, dIdx) => (
                                                <li key={dIdx} style={{ marginBottom: '5px' }}>{diff}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
