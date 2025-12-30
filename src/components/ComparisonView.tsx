import './ComparisonView.css';

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
        <div className="comparison-view-overlay">
            <div className="comparison-view-modal">
                {/* Header */}
                <div className="comparison-view-header">
                    <h2 className="comparison-view-title">Frame Comparison Analysis</h2>
                    <button
                        onClick={onClose}
                        className="btn-close-comparison"
                    >
                        ✕
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="comparison-view-scroll-content">
                    {/* Images Side-by-Side */}
                    <div className="comparison-images-grid">
                        {/* Start Frame */}
                        <div className="frame-comparison-container">
                            <div className="frame-comparison-label">
                                START FRAME
                            </div>
                            <div className="frame-comparison-img-box">
                                <img
                                    src={`file:///${frame1Path.replace(/\\/g, '/')}`}
                                    alt="Start Frame"
                                    className="frame-comparison-img"
                                />
                            </div>
                        </div>

                        {/* Arrow Icon (visible on larger screens) */}
                        <div className="comparison-arrow">
                            ➜
                        </div>

                        {/* End Frame */}
                        <div className="frame-comparison-container">
                            <div className="frame-comparison-label">
                                END FRAME
                            </div>
                            <div className="frame-comparison-img-box">
                                <img
                                    src={`file:///${frame2Path.replace(/\\/g, '/')}`}
                                    alt="End Frame"
                                    className="frame-comparison-img"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Analysis Content */}
                    <div className="comparison-analysis-card">
                        {/* Action Description */}
                        <div className="analysis-section">
                            <h3 className="analysis-section-title action">
                                Action Description
                            </h3>
                            <p className="analysis-text">
                                {comparisonResult.action_description}
                            </p>
                        </div>

                        {/* Object Flow */}
                        <div className="analysis-section">
                            <h3 className="analysis-section-title flow">
                                Object Flow & Movement
                            </h3>
                            <p className="analysis-text">
                                {comparisonResult.object_flow}
                            </p>
                        </div>

                        {/* Key Differences */}
                        <div className="analysis-section">
                            <h3 className="analysis-section-title differences">
                                Key Differences
                            </h3>
                            <ul className="analysis-list">
                                {comparisonResult.differences.map((diff, i) => (
                                    <li key={i} className="analysis-list-item">{diff}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="comparison-view-footer">
                    <button
                        onClick={onClose}
                        className="btn-secondary"
                    >
                        Close
                    </button>
                    <button
                        onClick={onExport}
                        disabled={isExporting}
                        className="btn-primary-export"
                    >
                        {isExporting ? 'Exporting...' : (
                            <>
                                <i className="btn-icon">📄</i> Export to JSON
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
