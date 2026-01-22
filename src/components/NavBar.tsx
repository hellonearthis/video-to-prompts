import React from 'react';
import './NavBar.css';

interface NavBarProps {
    onChangeVideo: () => void;
    currentView: 'frames' | 'storyboard';
    onViewChange: (view: 'frames' | 'storyboard') => void;
    fileName?: string | null;
    hasTimelineItems: boolean;
}

export const NavBar: React.FC<NavBarProps> = ({
    onChangeVideo,
    currentView,
    onViewChange,
    fileName,
    hasTimelineItems
}) => {
    return (
        <nav className="navbar">
            <div className="navbar-left">
                <button
                    onClick={onChangeVideo}
                    className="nav-btn change-video-btn"
                >
                    Change Video
                </button>
                {fileName && <span className="nav-filename">{fileName}</span>}
                {currentView === 'storyboard' && (
                    <button
                        onClick={() => onViewChange('frames')}
                        className="nav-btn back-btn"
                        style={{ marginLeft: '10px', color: '#007AFF', border: '1px solid #007AFF' }}
                    >
                        ← Back to Frames
                    </button>
                )}
            </div>

            <div className="navbar-center">
                {hasTimelineItems && (
                    <div className="nav-group">
                        <button
                            className={`nav-tab nav-tab-storyboard ${currentView === 'storyboard' ? 'active' : ''}`}
                            onClick={() => onViewChange('storyboard')}
                        >
                            Full Storyboard
                        </button>
                    </div>
                )}
            </div>

            <div className="navbar-right">
                {/* Placeholder for future top-right controls if needed */}
            </div>
        </nav>
    );
};
