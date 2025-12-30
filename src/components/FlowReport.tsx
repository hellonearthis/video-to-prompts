import './FlowReport.css';

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
        <div className="flow-report-overlay">
            <div className="flow-report-modal">
                {/* Header */}
                <div className="flow-report-header">
                    <div>
                        <h2 className="flow-report-title">Sequential Flow Analysis</h2>
                        <div className="flow-report-subtitle">
                            {results.length} transitions analyzed
                        </div>
                    </div>
                    <div className="flow-report-actions">
                        <button
                            onClick={onExport}
                            className="btn-export-report"
                        >
                            Export JSON Report
                        </button>
                        <button
                            onClick={onClose}
                            className="btn-close-report"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flow-report-content">
                    {results.map((pair, idx) => (
                        <div key={idx} className="flow-pair-card">
                            <div className="flow-pair-visuals">
                                <div className="frame-preview-container">
                                    <span className="frame-preview-label">F{idx + 1}</span>
                                    <img
                                        src={`file:///${pair.frame1.replace(/\\/g, '/')}`}
                                        alt={`Frame ${idx + 1}`}
                                        className="frame-preview-img"
                                    />
                                </div>
                                <div className="flow-arrow">→</div>
                                <div className="frame-preview-container">
                                    <span className="frame-preview-label">F{idx + 2}</span>
                                    <img
                                        src={`file:///${pair.frame2.replace(/\\/g, '/')}`}
                                        alt={`Frame ${idx + 2}`}
                                        className="frame-preview-img"
                                    />
                                </div>
                                <div className="transition-title-container">
                                    <h3 className="transition-title">Transition {idx + 1} to {idx + 2}</h3>
                                </div>
                            </div>

                            {pair.error ? (
                                <div className="flow-error-container">
                                    <strong>Error:</strong> {pair.error}
                                </div>
                            ) : (
                                <div className="flow-comparison-grid">
                                    <div>
                                        <h4 className="flow-section-title">Action & Flow</h4>
                                        <p className="flow-description-text">{pair.comparison?.action_description}</p>

                                        <h4 className="flow-section-title mt">Object Movement</h4>
                                        <p className="flow-description-text">{pair.comparison?.object_flow}</p>
                                    </div>
                                    <div>
                                        <h4 className="flow-section-title">Key Differences</h4>
                                        <ul className="flow-differences-list">
                                            {pair.comparison?.differences?.map((diff, dIdx) => (
                                                <li key={dIdx} className="flow-difference-item">{diff}</li>
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
