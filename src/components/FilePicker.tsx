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

import React, { useState } from 'react';

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
    // Drag Event Handlers
    // --------------------------------------------------------------------------

    /**
     * Handles dragenter, dragover, and dragleave events.
     * Updates the visual state to indicate when a file is being dragged over.
     */
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    /**
     * Handles the drop event when a file is released over the drop zone.
     * Extracts the file path and notifies the parent component.
     * 
     * Note: Electron's File object includes a 'path' property that contains
     * the absolute file system path, which is not available in standard browsers.
     */
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            // Cast to 'any' to access Electron's extended File properties
            const file = e.dataTransfer.files[0] as any;
            if (file.path) {
                onFileSelected(file.path);
            }
        }
    };

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
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleClick}
            style={{
                // Dashed border indicates drop zone
                border: '2px dashed #666',
                borderRadius: '8px',
                padding: '40px',
                textAlign: 'center',
                cursor: 'pointer',
                // Visual feedback: darker background when dragging
                backgroundColor: dragActive ? '#333' : 'transparent',
                transition: 'background-color 0.2s'
            }}
        >
            {/* Primary instruction text */}
            <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
                Drag & Drop a video file here
            </p>

            {/* Secondary instruction */}
            <p style={{ fontSize: '0.9rem', color: '#888' }}>
                or click to browse
            </p>
        </div>
    );
};
