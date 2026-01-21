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
            </div>

            <div className="navbar-center">
                <div className="nav-group">
                    <button
                        className={`nav-tab ${currentView === 'frames' ? 'active' : ''}`}
                        onClick={() => onViewChange('frames')}
                    >
                        Frames & Analysis
                    </button>
                    {hasTimelineItems && (
                        <button
                            className={`nav-tab nav-tab-storyboard ${currentView === 'storyboard' ? 'active' : ''}`}
                            onClick={() => onViewChange('storyboard')}
                        >
                            Full Storyboard
                        </button>
                    )}
                </div>
            </div>

            <div className="navbar-right">
                {/* Placeholder for future top-right controls if needed */}
            </div>
        </nav>
    );
};
