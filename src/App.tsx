/**
 * Main Application Component
 * 
 * This is the root React component that orchestrates the entire UI.
 * It manages the application's state and coordinates the workflow:
 * 1. File selection (via FilePicker)
 * 2. Video info display (metadata from FFprobe)
 * 3. Extraction settings (via ControlPanel)
 * 4. Frame display (via ThumbnailGrid)
 */

import { useState, useEffect } from 'react';
import './App.css';
import { FilePicker } from './components/FilePicker';
import { ControlPanel } from './components/ControlPanel';
import { ThumbnailGrid, FrameData } from './components/ThumbnailGrid';

/**
 * Video metadata type (matches VideoInfo from backend)
 */
interface VideoInfo {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
  totalFrames: number;
  bitrate: number;
}

function App() {
  // ============================================================================
  // State Management
  // ============================================================================

  /** Path to the currently selected video file */
  const [filePath, setFilePath] = useState<string | null>(null);

  /** Video metadata from FFprobe */
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  /** Array of extracted frames with metadata */
  const [frames, setFrames] = useState<FrameData[]>([]);

  // --------------------------------------------------------------------------
  // Extraction Settings
  // --------------------------------------------------------------------------

  /** Frames per second to extract */
  const [fps, setFps] = useState(1);

  /** Scene detection threshold */
  const [threshold, setThreshold] = useState(0.3);

  /** Whether to extract frames at time intervals */
  const [doTimeFrames, setDoTimeFrames] = useState(true);

  /** Whether to extract actual keyframes (I-frames) */
  const [doKeyframes, setDoKeyframes] = useState(false);

  /** Whether to extract scene change frames */
  const [doSceneChanges, setDoSceneChanges] = useState(true);

  // --------------------------------------------------------------------------
  // Loading States
  // --------------------------------------------------------------------------

  const [isProcessing, setIsProcessing] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);

  // ============================================================================
  // Effects
  // ============================================================================

  /**
   * Load video info when a file is selected
   */
  useEffect(() => {
    if (filePath) {
      window.ipcRenderer.getVideoInfo(filePath)
        .then(info => setVideoInfo(info))
        .catch(err => console.error('Failed to get video info:', err));
    }
  }, [filePath]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleFileSelect = (path: string) => {
    setFilePath(path);
    setVideoInfo(null);
    setFrames([]);
  };

  const handleRunExtraction = async () => {
    if (!filePath) return;

    setIsProcessing(true);
    setFrames([]);

    try {
      const outputDir = filePath + '_extracted';
      const newFrames: FrameData[] = [];

      if (doTimeFrames) {
        console.log(`Extracting frames at ${fps} fps...`);
        const paths = await window.ipcRenderer.extractTimeFrames(filePath, outputDir, fps);
        newFrames.push(...paths.map((p, i) => ({
          path: p,
          type: 'time' as const,
          frame: i + 1,
          time: (i + 1) / fps
        })));
      }

      if (doKeyframes) {
        console.log('Extracting Keyframes (I-frames)...');
        const paths = await window.ipcRenderer.extractKeyframes(filePath, outputDir);
        newFrames.push(...paths.map((p: string, i: number) => ({
          path: p,
          type: 'keyframe' as const,
          frame: i + 1,
          time: undefined // Keyframes don't have predictable timing
        })));
      }

      if (doSceneChanges) {
        console.log('Extracting Scene Changes...');
        const sceneData = await window.ipcRenderer.extractSceneChanges(filePath, outputDir, threshold);
        newFrames.push(...sceneData.map(s => ({
          path: s.path,
          type: 'scene' as const,
          frame: s.frame,
          time: s.time,
          pts: s.pts
        })));
      }

      newFrames.sort((a, b) =>
        a.time && b.time ? a.time - b.time : a.path.localeCompare(b.path)
      );

      setFrames(newFrames);

    } catch (error) {
      console.error(error);
      alert('Extraction failed: ' + error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateDescriptions = async () => {
    alert("Coming in Phase 3!");
    setIsDescribing(true);
    setTimeout(() => setIsDescribing(false), 1000);
  };

  // ============================================================================
  // Helper: Format duration
  // ============================================================================

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      className="app-container"
      style={{
        minHeight: '100vh',
        backgroundColor: '#1e1e1e',
        color: '#eee'
      }}
    >
      {/* Application Header */}
      <header style={{
        padding: '10px 20px',
        backgroundColor: '#252526',
        borderBottom: '1px solid #000',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Video to Prompts</h1>
          {filePath && (
            <button
              onClick={() => { setFilePath(null); setVideoInfo(null); setFrames([]); }}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                backgroundColor: 'transparent',
                border: '1px solid #666',
                borderRadius: '4px',
                color: '#aaa',
                cursor: 'pointer'
              }}
            >
              Change Video
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      {!filePath ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'calc(100vh - 50px)',
          padding: '20px'
        }}>
          <div style={{ width: '400px' }}>
            <FilePicker onFileSelected={handleFileSelect} />
          </div>
        </div>
      ) : (
        <>
          {/* Video Info Bar */}
          {videoInfo && (
            <div style={{
              padding: '10px 20px',
              backgroundColor: '#2a2a2a',
              borderBottom: '1px solid #333',
              display: 'flex',
              gap: '20px',
              flexWrap: 'wrap',
              fontSize: '0.85rem'
            }}>
              <span><strong>Duration:</strong> {formatDuration(videoInfo.duration)}</span>
              <span><strong>FPS:</strong> {videoInfo.fps}</span>
              <span><strong>Resolution:</strong> {videoInfo.width}×{videoInfo.height}</span>
              <span><strong>Codec:</strong> {videoInfo.codec}</span>
              <span><strong>Bitrate:</strong> {videoInfo.bitrate} kb/s</span>
              <span><strong>Total Frames:</strong> {videoInfo.totalFrames}</span>
            </div>
          )}

          {/* Control Panel */}
          <ControlPanel
            fps={fps}
            setFps={setFps}
            threshold={threshold}
            setThreshold={setThreshold}
            extractTimeFrames={doTimeFrames}
            setExtractTimeFrames={setDoTimeFrames}
            extractKeyframes={doKeyframes}
            setExtractKeyframes={setDoKeyframes}
            extractSceneChanges={doSceneChanges}
            setExtractSceneChanges={setDoSceneChanges}
            onRunExtraction={handleRunExtraction}
            isProcessing={isProcessing}
          />

          {/* Thumbnail Grid - flexible height, scrolls with page */}
          <ThumbnailGrid
            frames={frames}
            onGenerateDescriptions={handleGenerateDescriptions}
            isDescribing={isDescribing}
          />
        </>
      )}
    </div>
  );
}

export default App;
