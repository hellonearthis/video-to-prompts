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
import { StoryboardView, SceneAnalysis } from './components/StoryboardView';
import { TimelineStrip } from './components/TimelineStrip';

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
  const [fps, setFps] = useState(3);

  /** Scene detection threshold */
  const [threshold, setThreshold] = useState(0.3);

  /** Whether to extract frames at time intervals */
  const [doTimeFrames, setDoTimeFrames] = useState(true);

  /** Whether to extract actual keyframes (I-frames) */
  const [doKeyframes, setDoKeyframes] = useState(false);

  /** Whether to extract scene change frames */
  const [doSceneChanges, setDoSceneChanges] = useState(false);

  // --------------------------------------------------------------------------
  // Loading States
  // --------------------------------------------------------------------------

  const [isProcessing, setIsProcessing] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);

  // --------------------------------------------------------------------------
  // Selection and Analysis State
  // --------------------------------------------------------------------------

  /** Set of selected frame indices */
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  /** Current analysis progress */
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | undefined>();

  /** Comparison result */
  // Removed comparison logic

  /** Sequential flow analysis results */
  // Removed flow results logic

  const [storyboardOpen, setStoryboardOpen] = useState(false);
  const [storyboardFrames, setStoryboardFrames] = useState<string[]>([]);
  const [storyTimeline, setStoryTimeline] = useState<SceneAnalysis[]>([]);
  const [cachedAnalysis, setCachedAnalysis] = useState<SceneAnalysis | null>(null);

  // --------------------------------------------------------------------------
  // AI Model State (LM Studio)
  // --------------------------------------------------------------------------

  const [aiStatusMessage, setAiStatusMessage] = useState<string>('Checking LM Studio...');

  const [showExtractionDialog, setShowExtractionDialog] = useState(false);
  const [existingFramesCount, setExistingFramesCount] = useState(0);

  // Auto-save timeline when it changes
  useEffect(() => {
    const saveTimeline = async () => {
      if (filePath && storyTimeline.length > 0) {
        const outputDir = filePath + '_extracted';
        await window.ipcRenderer.saveStoryTimeline(outputDir, storyTimeline);
      }
    };
    saveTimeline();
  }, [storyTimeline, filePath]);

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

  /**
   * Listen for analysis progress (from LM Studio batch)
   */
  useEffect(() => {
    const removeSingle = window.ipcRenderer.on('analysis-progress', (_event, data: any) => {
      setAnalysisProgress({ current: data.current, total: data.total });
    });

    return () => {
      removeSingle();
    };
  }, []);

  /**
   * Initialize LM Studio connection on load
   */
  useEffect(() => {
    window.ipcRenderer.checkLMStudio()
      .then((result: any) => {
        if (result.success) {
          setAiStatusMessage('LM Studio Connected');
        } else {
          setAiStatusMessage('LM Studio Disconnected');
        }
      })
      .catch((err: Error) => {
        console.error('Failed to connect to LM Studio:', err);
        setAiStatusMessage('Connection Error');
      });
  }, []);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleFileSelect = (path: string) => {
    setFilePath(path);
    setVideoInfo(null);
    setFrames([]);
  };

  const handleModelChange = () => {
    // Refresh connection status
    setAiStatusMessage('Checking LM Studio...');
    window.ipcRenderer.checkLMStudio()
      .then((result: any) => {
        if (result.success) {
          setAiStatusMessage('LM Studio Connected');
        } else {
          setAiStatusMessage('LM Studio Disconnected');
          alert('LM Studio not found. Please ensure LM Studio is running on localhost:1234');
        }
      })
      .catch(err => {
        console.error('Failed to check LM Studio:', err);
        setAiStatusMessage('Connection Error');
      });
  };

  const handleRunExtraction = async (forceNew = false) => {
    if (!filePath) return;

    const outputDir = filePath + '_extracted';

    // Step 1: Check if folder already exists (and we aren't forcing a new run)
    if (!forceNew) {
      const check = await window.ipcRenderer.checkExtractionExists(outputDir);
      if (check.exists && check.hasFrames) {
        setExistingFramesCount(check.count || 0);
        setShowExtractionDialog(true);
        return;
      }
    }

    setIsProcessing(true);
    setFrames([]);
    setShowExtractionDialog(false);

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

  /**
   * Use existing frames from the folder
   */
  const handleUseExistingFrames = async () => {
    if (!filePath) return;
    const outputDir = filePath + '_extracted';
    setIsProcessing(true);
    setShowExtractionDialog(false);

    try {
      const result = await window.ipcRenderer.listFrames(outputDir);
      if (result.success) {
        // Mock some frame data based on paths
        const loadedFrames: FrameData[] = result.frames.map((p: string, i: number) => ({
          path: p,
          type: 'keyframe', // Assume keyframe for simplicity
          frame: i + 1,
          time: undefined
        }));
        setFrames(loadedFrames);

        // Also try to load existing timeline
        const timelineResult = await window.ipcRenderer.loadStoryTimeline(outputDir);
        if (timelineResult.success && timelineResult.timeline) {
          setStoryTimeline(timelineResult.timeline);
          console.log("Restored timeline from disk:", timelineResult.timeline.length, "scenes");
        }
      } else {
        alert("Failed to load frames: " + result.error);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
      // (Optional) Ensure model is loaded - handled by handleModelChange mostly

      // Analyze each frame and update state progressively
      const newFrames = [...frames];

      for (let i = 0; i < indicesToAnalyze.length; i++) {
        const frameIndex = indicesToAnalyze[i];
        const frame = newFrames[frameIndex];

        if (!frame) {
          console.warn(`Frame at index ${frameIndex} is undefined. Skipping.`);
          continue;
        }

        setAnalysisProgress({ current: i + 1, total: indicesToAnalyze.length });

        try {
          const result = await window.ipcRenderer.analyzeFrame(frame.path);

          if (result.success && result.analysis) {
            newFrames[frameIndex] = {
              ...frame,
              description: result.analysis.summary,
              objects: result.analysis.objects,
              tags: result.analysis.tags,
              scene_type: result.analysis.scene_type,
              visual_elements: result.analysis.visual_elements,
              isAnalyzed: true,
              analysisError: undefined
            };
          } else {
            newFrames[frameIndex] = {
              ...frame,
              isAnalyzed: false,
              analysisError: result.error || 'Unknown error'
            };
          }

          // Update state after each frame to show progress
          setFrames([...newFrames]);

        } catch (error) {
          console.error(`Error analyzing frame ${frameIndex}:`, error);
          newFrames[frameIndex] = {
            ...frame,
            isAnalyzed: false,
            analysisError: error instanceof Error ? error.message : 'Analysis failed'
          };
          setFrames([...newFrames]);
        }
      }

    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed: ' + (error instanceof Error ? error.message : error));
    } finally {
      setIsDescribing(false);
      setAnalysisProgress(undefined);
    }
  };

  /**
   * Analyze only selected frames
   */
  // --------------------------------------------------------------------------
  // Story Analysis
  // --------------------------------------------------------------------------


  // --------------------------------------------------------------------------
  // Storyboard Logic
  // --------------------------------------------------------------------------

  /**
   * Handle Story Analysis for selected frames
   */
  const handleAnalyzeStory = () => {
    const selectedPaths = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map(idx => frames[idx].path);

    if (selectedPaths.length < 2) return;

    // Check if we have a valid cache for these EXACT frames
    const isCacheValid = cachedAnalysis &&
      cachedAnalysis.frames &&
      JSON.stringify(cachedAnalysis.frames) === JSON.stringify(selectedPaths);

    if (isCacheValid) {
      console.log("Using cached story analysis");
      // Keep cachedAnalysis as is
    } else {
      console.log("New selection, clearing cache");
      setCachedAnalysis(null);
    }

    setStoryboardFrames(selectedPaths);
    setStoryboardOpen(true);
  };

  /**
   * Cache the analysis when it completes
   */
  const handleAnalysisComplete = (analysis: SceneAnalysis) => {
    setCachedAnalysis(analysis);

    // Auto-sync with timeline if this scene already exists there
    setStoryTimeline(prev => {
      const index = prev.findIndex(s => s.scene_id === analysis.scene_id);
      if (index !== -1) {
        const newTimeline = [...prev];
        newTimeline[index] = analysis;
        console.log("Auto-synced scene in timeline:", analysis.scene_id);
        return newTimeline;
      }
      // Add new scene
      console.log("Added new scene to timeline:", analysis.scene_id);
      return [...prev, analysis];
    });
  };

  /**
   * Export a single scene's analysis
   */
  const handleExportScene = async (analysis: SceneAnalysis) => {
    if (!filePath) return;
    const outputDir = filePath + '_extracted';

    // Create a specific filename structure for scenes
    const safeId = analysis.scene_id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `story_scene_${safeId}_${Date.now()}`;

    try {
      // We reuse the generic JSON export but could create a specific one if needed
      const result = await window.ipcRenderer.exportAnalysisJson(outputDir, {
        ...analysis,
        filename // Suggestion for the backend if it supported it, but it likely uses a fixed name or generic
      });
      // Note: The backend 'export-analysis-json' creates 'analysis_results.json'.
      // We might want to update the backend to accept a filename, or just let it update the generic one.
      // For now, let's just dump it.

      if (result.success) {
        alert(`Analysis exported to:\n${result.path}`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Export error", error);
      alert("Export failed");
    }
  };

  const handleRemoveFromTimeline = (index: number) => {
    setStoryTimeline(prev => prev.filter((_, i) => i !== index));
  };

  const handleViewTimelineScene = (scene: SceneAnalysis) => {
    // Re-hydrate the storyboard view with stored data
    if (scene.frames) {
      setStoryboardFrames(scene.frames);
      setCachedAnalysis(scene); // This ensures the view loads the existing analysis
      setStoryboardOpen(true);
    }
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
    <div className="app-container">
      {/* Application Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="header-title">Video to Prompts</h1>
          {filePath && (
            <button
              onClick={() => { setFilePath(null); setVideoInfo(null); setFrames([]); }}
              className="btn-change-video"
            >
              Change Video
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      {/* Status Bar */}
      <div className="status-bar-secondary">
        <div className="status-bar-info">
          <span className={`engine-status ${aiStatusMessage.includes('Connected') ? 'connected' : 'disconnected'}`}>
            Engine: {aiStatusMessage}
          </span>
          {analysisProgress && (
            <span className="analysis-status">
              Analyzing: {analysisProgress.current} / {analysisProgress.total}
            </span>
          )}
        </div>
        {filePath && (
          <div className="file-path-display">
            {filePath}
          </div>
        )}
      </div>

      {!filePath ? (
        <div className="empty-state-container">
          <div className="empty-state-inner">
            <FilePicker onFileSelected={handleFileSelect} />
          </div>
        </div>
      ) : (
        <>
          {/* Video Info Bar */}
          {videoInfo && (
            <div className="video-info-bar">
              <span><strong>Duration:</strong> {formatDuration(videoInfo.duration)}</span>
              <span><strong>FPS:</strong> {videoInfo.fps}</span>
              <span><strong>Resolution:</strong> {videoInfo.width}×{videoInfo.height}</span>
              <span><strong>Codec:</strong> {videoInfo.codec}</span>
              <span><strong>Bitrate:</strong> {videoInfo.bitrate} kb/s</span>
              <span><strong>Total Frames:</strong> {videoInfo.totalFrames}</span>
              <span className={`ai-status-indicator ${aiStatusMessage.includes('Connected') ? 'connected' : 'error'}`}>
                {aiStatusMessage}
              </span>
            </div>
          )}

          {/* Timeline Strip */}
          <TimelineStrip
            timeline={storyTimeline}
            onRemoveScene={handleRemoveFromTimeline}
            onViewScene={handleViewTimelineScene}
          />

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
            selectedModel="LM Studio (Local API)"
            onModelChange={handleModelChange}
            framesCount={frames.length}
          />

          {/* Thumbnail Grid - flexible height, scrolls with page */}
          <ThumbnailGrid
            frames={frames}
            selectedIndices={selectedIndices}
            onSelectionChange={setSelectedIndices}
            onAnalyzeStory={handleAnalyzeStory}
            isDescribing={isDescribing}
            analysisProgress={analysisProgress}
            hasAnalyzedFrames={frames.some(f => f.isAnalyzed)}
          />

          {/* Storyboard View */}
          <StoryboardView
            isOpen={storyboardOpen}
            onClose={() => setStoryboardOpen(false)}
            framePaths={storyboardFrames}
            onSaveToTimeline={handleSaveToTimeline}
            onExport={handleExportScene}
            initialAnalysis={cachedAnalysis}
            onAnalysisComplete={handleAnalysisComplete}
            timeline={storyTimeline}
          />
        </>
      )}

      {/* Status Bar */}
      <footer className="app-footer">
        <div className="footer-info">
          <span><strong>AI Engine:</strong> LM Studio</span>
          {isDescribing ? (
            <span><strong>Status:</strong> Analyzing Frames...</span>
          ) : isProcessing ? (
            <span><strong>Status:</strong> Extracting Frames...</span>
          ) : (
            <span><strong>Status:</strong> {aiStatusMessage}</span>
          )}
        </div>
        <div className="footer-version">
          v1.0.0
        </div>
      </footer>

      {/* Extraction Choice Dialog */}
      {showExtractionDialog && (
        <div className="modal-overlay">
          <div className="dialog-container">
            <h2 className="dialog-title">Existing Frames Found</h2>
            <p className="dialog-text">
              We found <strong>{existingFramesCount}</strong> previously extracted images for this video.
              Would you like to reuse them or clear the folder and start over?
            </p>
            <div className="dialog-actions">
              <button
                onClick={handleUseExistingFrames}
                className="btn-dialog-primary"
              >
                🚀 Reuse Existing Frames
              </button>
              <button
                onClick={() => handleRunExtraction(true)}
                className="btn-dialog-secondary"
              >
                🧹 Delete & Re-run Extraction
              </button>
              <button
                onClick={() => setShowExtractionDialog(false)}
                className="btn-dialog-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
