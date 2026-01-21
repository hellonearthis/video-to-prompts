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
import { FullStoryboardView } from './components/FullStoryboardView';
import { NavBar } from './components/NavBar';

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
  const [sceneDetectionThreshold, setSceneDetectionThreshold] = useState(0.3);

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --------------------------------------------------------------------------
  // Selection and Analysis State
  // --------------------------------------------------------------------------

  /** Set of selected frame indices */
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  /** Current analysis progress */
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | undefined>();

  /** Set of hidden frame paths */
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(new Set());
  /** Whether to show hidden frames */
  const [showHidden, setShowHidden] = useState(false);

  /** Whether to show the extraction control panel */
  const [showExtractionPanel, setShowExtractionPanel] = useState(true);

  const [storyboardOpen, setStoryboardOpen] = useState(false);
  // fullStoryboardOpen removed
  const [currentView, setCurrentView] = useState<'frames' | 'storyboard'>('frames');
  const [storyboardFrames, setStoryboardFrames] = useState<string[]>([]);
  const [storyTimeline, setStoryTimeline] = useState<SceneAnalysis[]>([]);
  const [cachedAnalysis, setCachedAnalysis] = useState<SceneAnalysis | null>(null);

  // --------------------------------------------------------------------------
  // AI Model State (LM Studio)
  // --------------------------------------------------------------------------

  const [aiStatusMessage, setAiStatusMessage] = useState<string>('Checking LM Studio...');

  const [showExtractionDialog, setShowExtractionDialog] = useState(false);
  const [existingFramesCount, setExistingFramesCount] = useState(0);

  // Prompt Management
  const [availablePrompts, setAvailablePrompts] = useState<string[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('Default');

  useEffect(() => {
    // Fetch available prompts
    window.ipcRenderer.getAvailablePrompts().then((result: any) => {
      if (result && result.prompts) {
        setAvailablePrompts(result.prompts);
        if (result.prompts.length > 0) {
          setSelectedPrompt(result.prompts[0]);
        }
      }
    }).catch((e: any) => console.warn("Failed to fetch prompts", e));
  }, []);

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
   * Check for existing extractions when file loads
   */
  useEffect(() => {
    const checkExisting = async () => {
      if (filePath) {
        // Reset dialog state first
        setShowExtractionDialog(false);

        const outputDir = filePath + '_extracted';
        try {
          const check = await window.ipcRenderer.checkExtractionExists(outputDir);
          if (check.exists && check.hasFrames) {
            setExistingFramesCount(check.count || 0);
            setShowExtractionDialog(true);
          }
        } catch (e) {
          console.error("Error checking for existing frames:", e);
        }
      }
    };
    checkExisting();
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
    setStoryTimeline([]);
    setStoryboardOpen(false);
    setCurrentView('frames');
    setCachedAnalysis(null);
    setSelectedIndices(new Set());
    setShowExtractionDialog(false);
    setShowExtractionPanel(true); // Reset to show panel on new file
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
        // Backend now returns { path: string, time: number }[]
        const timeFrames = await window.ipcRenderer.extractTimeFrames(filePath, outputDir, fps);
        newFrames.push(...timeFrames.map((tf: { path: string, time: number }, i: number) => ({
          path: tf.path,
          type: 'time' as const,
          frame: i + 1,
          time: tf.time
        })));
      }

      if (doKeyframes) {
        console.log('Extracting Keyframes (I-frames)...');
        // Backend now returns { path: string, time: number }[]
        const keyframes = await window.ipcRenderer.extractKeyframes(filePath, outputDir);
        newFrames.push(...keyframes.map((kf: { path: string, time: number }, i: number) => ({
          path: kf.path,
          type: 'keyframe' as const,
          frame: i + 1,
          time: kf.time
        })));
      }

      if (doSceneChanges) {
        console.log('Extracting Scene Changes...');
        const sceneData = await window.ipcRenderer.extractSceneChanges(filePath, outputDir, sceneDetectionThreshold);
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
      setShowExtractionPanel(false); // Hide panel after extraction
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
        setShowExtractionPanel(false); // Hide panel after loading existing

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
   * Analyze only selected frames
   */
  const handleAnalyzeSelectedFrames = async () => {
    // Let's analyze selected, or all if none selected
    let indicesToAnalyze: number[] = [];

    if (selectedIndices.size > 0) {
      indicesToAnalyze = Array.from(selectedIndices).sort((a, b) => a - b);
    } else {
      // Analyze all
      indicesToAnalyze = frames.map((_, i) => i);
    }

    if (indicesToAnalyze.length === 0) {
      alert("No frames extracted yet.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: indicesToAnalyze.length });

    try {
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
          // Pass the selected prompt type!
          const result = await window.ipcRenderer.analyzeFrame(frame.path, selectedPrompt);

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
      setIsAnalyzing(false);
      setAnalysisProgress(undefined);
    }
  };

  /**
   * Hide currently selected frames
   */
  const handleHideSelected = () => {
    const newHidden = new Set(hiddenPaths);
    selectedIndices.forEach(idx => {
      if (frames[idx]) {
        newHidden.add(frames[idx].path);
      }
    });
    setHiddenPaths(newHidden);
    setSelectedIndices(new Set());
  };

  /**
   * Unhide a specific frame
   */
  const handleUnhide = (path: string) => {
    const newHidden = new Set(hiddenPaths);
    newHidden.delete(path);
    setHiddenPaths(newHidden);
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
      return prev;
    });
  };

  /**
   * Save a completed scene analysis to the timeline (Upsert)
   */
  const handleSaveToTimeline = (analysis: SceneAnalysis) => {
    setStoryTimeline(prev => {
      const index = prev.findIndex(s => s.scene_id === analysis.scene_id);
      if (index !== -1) {
        // Update existing scene
        const newTimeline = [...prev];
        newTimeline[index] = analysis;
        console.log("Updated scene in timeline:", analysis.scene_id);
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
      {/* Navigation Bar */}
      <NavBar
        onChangeVideo={() => {
          setFilePath(null);
          setVideoInfo(null);
          setFrames([]);
          setStoryTimeline([]);
          setStoryboardOpen(false);
          setCachedAnalysis(null);
          setSelectedIndices(new Set());
          setCurrentView('frames');
        }}
        currentView={currentView}
        onViewChange={setCurrentView}
        fileName={filePath?.split(/[/\\]/).pop()}
        hasTimelineItems={storyTimeline.length > 0}
      />
      {/* Main Content */}
      {!filePath ? (
        <div className="empty-state-container">
          <div className="empty-state-inner">
            <FilePicker onFileSelected={handleFileSelect} />
          </div>
        </div>
      ) : (
        <>
          {/* View: Frames & Analysis */}
          <div style={{ display: currentView === 'frames' ? 'block' : 'none' }}>
            {/* Video Info Bar */}
            {videoInfo && (
              <div className="video-info-bar">
                <div className="video-info-left">
                  <span><strong>Duration:</strong> {formatDuration(videoInfo.duration)}</span>
                  <span><strong>FPS:</strong> {videoInfo.fps}</span>
                  <span><strong>Res:</strong> {videoInfo.width}×{videoInfo.height}</span>
                  <span><strong>Frames:</strong> {videoInfo.totalFrames}</span>
                </div>

                <div className="video-info-center">
                  {analysisProgress && (
                    <span className="analysis-status">
                      Analyzing: {analysisProgress.current} / {analysisProgress.total}
                    </span>
                  )}
                  <span className={`ai-status-indicator ${aiStatusMessage.includes('Connected') ? 'connected' : 'error'}`}>
                    {aiStatusMessage}
                  </span>
                </div>

                <div className="video-info-right">
                  {/* Path is now in NavBar */}
                </div>
              </div>
            )}

            {/* Timeline Strip */}
            <TimelineStrip
              timeline={storyTimeline}
              onRemoveScene={handleRemoveFromTimeline}
              onViewScene={handleViewTimelineScene}
            />

            {/* Control Panel (Conditionally rendered) */}
            {showExtractionPanel && (
              <ControlPanel
                fps={fps}
                setFps={setFps}
                sceneDetectionThreshold={sceneDetectionThreshold}
                setSceneDetectionThreshold={setSceneDetectionThreshold}
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
                availablePrompts={availablePrompts}
                selectedPrompt={selectedPrompt}
                onPromptChange={setSelectedPrompt}
              />
            )}

            {/* ThumbnailGrid */}
            <ThumbnailGrid
              frames={frames}
              selectedIndices={selectedIndices}
              onSelectionChange={setSelectedIndices}
              onAnalyzeStory={handleAnalyzeStory}
              onAnalyzeFrames={handleAnalyzeSelectedFrames}
              isAnalyzing={isAnalyzing}
              analysisProgress={analysisProgress}
              hasAnalyzedFrames={frames.some(f => f.isAnalyzed)}
              hiddenPaths={hiddenPaths}
              showHidden={showHidden}
              onUnhide={handleUnhide}
              showExtractionPanel={showExtractionPanel}
              onToggleExtractionPanel={() => setShowExtractionPanel(prev => !prev)}
              onHideSelected={handleHideSelected}
              onToggleShowHidden={() => setShowHidden(!showHidden)}
            />
          </div>

          {/* View: Full Storyboard */}
          {currentView === 'storyboard' && (
            <FullStoryboardView
              isOpen={true}
              onClose={() => setCurrentView('frames')}
              timeline={storyTimeline}
            />
          )}

          {/* Storyboard Modal (Scene Editor) */}
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
