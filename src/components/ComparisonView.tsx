/**
 * ComparisonView Component
 * 
 * Displays the result of an AI comparison between two frames.
 * Shows the "Start" and "End" frames side-by-side with the AI-generated
 * analysis of the action, object flow, and differences.
 */

import React from 'react';

// ============================================================================
// Type Definitions
// ============================================================================

interface ComparisonViewProps {
    frame1Path: string;
    frame2Path: string;
    comparisonResult: ComparisonResult;
    onClose: () => void;
    onExport: () => void;
    isExporting: boolean;
}

// ============================================================================
// Component Implementation
// ============================================================================

export const ComparisonView: React.FC<ComparisonViewProps> = ({
    frame1Path,
    frame2Path,
    comparisonResult,
    onClose,
    onExport,
    isExporting
}) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: '#1e1e1e',
                borderRadius: '8px',
                width: '90%',
                maxWidth: '1000px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                border: '1px solid #333'
            }}>
                {/* Header */}
                <div style={{
                    padding: '15px 20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#252526'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Frame Comparison Analysis</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#aaa',
                            fontSize: '1.2rem',
                            cursor: 'pointer'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Scrollable Content */}
                <div style={{
                    overflowY: 'auto',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}>
                    {/* Images Side-by-Side */}
                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        flexWrap: 'wrap'
                    }}>
                        {/* Start Frame */}
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <div style={{
                                marginBottom: '8px',
                                color: '#aaa',
                                fontSize: '0.9rem',
                                fontWeight: 'bold'
                            }}>
                                START FRAME
                            </div>
                            <div style={{
                                aspectRatio: '16/9',
                                backgroundColor: '#000',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                border: '2px solid #333'
                            }}>
                                <img
                                    src={`file:///${frame1Path.replace(/\\/g, '/')}`}
                                    alt="Start Frame"
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            </div>
                        </div>

                        {/* Arrow Icon (visible on larger screens) */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#555',
                            fontSize: '2rem'
                        }}>
                            ➜
                        </div>

                        {/* End Frame */}
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <div style={{
                                marginBottom: '8px',
                                color: '#aaa',
                                fontSize: '0.9rem',
                                fontWeight: 'bold'
                            }}>
                                END FRAME
                            </div>
                            <div style={{
                                aspectRatio: '16/9',
                                backgroundColor: '#000',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                border: '2px solid #333'
                            }}>
                                <img
                                    src={`file:///${frame2Path.replace(/\\/g, '/')}`}
                                    alt="End Frame"
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Analysis Content */}
                    <div style={{
                        backgroundColor: '#2a2a2a',
                        padding: '20px',
                        borderRadius: '6px',
                        marginTop: '10px'
                    }}>
                        {/* Action Description */}
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{
                                margin: '0 0 10px 0',
                                fontSize: '1rem',
                                color: '#4CAF50',
                                borderBottom: '1px solid #444',
                                paddingBottom: '5px'
                            }}>
                                Action Description
                            </h3>
                            <p style={{ lineHeight: '1.5', color: '#eee', margin: 0 }}>
                                {comparisonResult.action_description}
                            </p>
                        </div>

                        {/* Object Flow */}
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{
                                margin: '0 0 10px 0',
                                fontSize: '1rem',
                                color: '#2196F3',
                                borderBottom: '1px solid #444',
                                paddingBottom: '5px'
                            }}>
                                Object Flow & Movement
                            </h3>
                            <p style={{ lineHeight: '1.5', color: '#eee', margin: 0 }}>
                                {comparisonResult.object_flow}
                            </p>
                        </div>

                        {/* Key Differences */}
                        <div>
                            <h3 style={{
                                margin: '0 0 10px 0',
                                fontSize: '1rem',
                                color: '#FF9800',
                                borderBottom: '1px solid #444',
                                paddingBottom: '5px'
                            }}>
                                Key Differences
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '20px', color: '#eee' }}>
                                {comparisonResult.differences.map((diff, i) => (
                                    <li key={i} style={{ marginBottom: '5px' }}>{diff}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div style={{
                    padding: '15px 20px',
                    borderTop: '1px solid #333',
                    backgroundColor: '#252526',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'transparent',
                            border: '1px solid #555',
                            color: '#ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                    <button
                        onClick={onExport}
                        disabled={isExporting}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#2196F3',
                            border: 'none',
                            color: 'white',
                            borderRadius: '4px',
                            cursor: isExporting ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {isExporting ? 'Exporting...' : (
                            <>
                                <span>📄</span> Export to JSON
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
