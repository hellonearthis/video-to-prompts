/**
 * FilePicker Component
 * 
 * A video file selection component that supports two input methods:
 * 1. Drag and drop - Drag a video file onto the drop zone
 * 2. Click to browse - Opens native file picker dialog
 * 
 * Features:
 * - Visual feedback during drag operations (background color change)
 * - Supports video files (MP4, MOV, AVI, MKV) via native dialog filters
 * - Uses Electron's IPC to communicate with main process for file selection
 * 
 * Note: In Electron, dropped files have a 'path' property with the full
 * file system path, unlike standard web File objects.
 */

import React, { useState, useEffect } from 'react';
import './FilePicker.css';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Props for the FilePicker component.
 */
interface FilePickerProps {
    /** Callback function called when a video file is selected */
    onFileSelected: (filePath: string) => void;
}

// ============================================================================
// Component Implementation
// ============================================================================

export const FilePicker: React.FC<FilePickerProps> = ({ onFileSelected }) => {
    // Track whether a drag operation is active (for visual feedback)
    const [dragActive, setDragActive] = useState(false);

    // --------------------------------------------------------------------------
    // Global Drag/Drop Handlers
    // --------------------------------------------------------------------------

    useEffect(() => {
        /**
         * Global drag handler to prevent default behavior and show active state.
         */
        const handleGlobalDrag = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.type === 'dragenter' || e.type === 'dragover') {
                setDragActive(true);
            }
        };

        /**
         * Global dragleave handler.
         */
        const handleGlobalDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            // Only deactivate if we're leaving the window
            if (e.relatedTarget === null) {
                setDragActive(false);
            }
        };

        /**
         * Global drop handler to catch files dropped anywhere.
         */
        const handleGlobalDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);

            if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                const path = window.ipcRenderer.getPathForFile(file);
                if (path) {
                    onFileSelected(path);
                }
            }
        };

        // Register global listeners
        window.addEventListener('dragenter', handleGlobalDrag);
        window.addEventListener('dragover', handleGlobalDrag);
        window.addEventListener('dragleave', handleGlobalDragLeave);
        window.addEventListener('drop', handleGlobalDrop);

        // Cleanup
        return () => {
            window.removeEventListener('dragenter', handleGlobalDrag);
            window.removeEventListener('dragover', handleGlobalDrag);
            window.removeEventListener('dragleave', handleGlobalDragLeave);
            window.removeEventListener('drop', handleGlobalDrop);
        };
    }, [onFileSelected]);

    // --------------------------------------------------------------------------
    // Click Handler
    // --------------------------------------------------------------------------

    /**
     * Handles click on the drop zone.
     * Opens the native file picker dialog via IPC.
     */
    const handleClick = async () => {
        const filePath = await window.ipcRenderer.selectFile();
        if (filePath) {
            onFileSelected(filePath);
        }
    };

    // --------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------

    return (
        <div
            className={`file-picker ${dragActive ? 'drag-active' : ''}`}
            onClick={handleClick}
        >
            {/* Primary instruction text */}
            <p className="file-picker-title">
                Drag & Drop a video file here
            </p>

            {/* Secondary instruction */}
            <p className="file-picker-subtitle">
                or click to browse
            </p>
        </div>
    );
};
