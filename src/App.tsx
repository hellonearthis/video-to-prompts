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
import { ComparisonView } from './components/ComparisonView';
import { FlowReport } from './components/FlowReport';

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

  // --------------------------------------------------------------------------
  // Selection and Analysis State
  // --------------------------------------------------------------------------

  /** Set of selected frame indices */
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  /** Current analysis progress */
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | undefined>();

  /** Comparison result */
  const [comparisonResult, setComparisonResult] = useState<{
    frame1: string;
    frame2: string;
    result: ComparisonResult;
  } | null>(null);

  /** Is comparison exporting */
  const [isExportingComparison, setIsExportingComparison] = useState(false);

  /** Sequential flow analysis results */
  const [flowResults, setFlowResults] = useState<FlowPairResult[] | null>(null);
  const [isAnalyzingFlow, setIsAnalyzingFlow] = useState(false);
  const [flowProgress, setFlowProgress] = useState<{ current: number, total: number } | undefined>();

  // --------------------------------------------------------------------------
  // AI Model State (LM Studio)
  // --------------------------------------------------------------------------

  const [aiStatusMessage, setAiStatusMessage] = useState<string>('Checking LM Studio...');

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

    const removeFlow = window.ipcRenderer.on('flow-analysis-progress', (_event, data: any) => {
      setFlowProgress({ current: data.current, total: data.total });
    });

    return () => {
      removeSingle();
      removeFlow();
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

  /**
   * Core function to analyze frames using LM Studio
   */
  const analyzeFrames = async (indicesToAnalyze: number[]) => {
    if (indicesToAnalyze.length === 0) return;

    setIsDescribing(true);
    setAnalysisProgress({ current: 0, total: indicesToAnalyze.length });

    try {
      // (Optional) Ensure model is loaded - handled by handleModelChange mostly

      // Analyze each frame and update state progressively
      const newFrames = [...frames];

      for (let i = 0; i < indicesToAnalyze.length; i++) {
        const frameIndex = indicesToAnalyze[i];
        const frame = newFrames[frameIndex];

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
  const handleAnalyzeSelected = async () => {
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    await analyzeFrames(indices);
  };

  /**
   * Analyze all frames
   */
  const handleAnalyzeAll = async () => {
    const allIndices = frames.map((_, i) => i);
    await analyzeFrames(allIndices);
  };

  /**
   * Handle comparing two selected frames
   */
  const handleCompareSelected = async () => {
    if (selectedIndices.size !== 2) return;

    // Get selected frames and sort by index (time)
    const selectedFrames = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map(index => frames[index]);

    const [frame1, frame2] = selectedFrames;

    try {
      setIsDescribing(true);

      const result = await window.ipcRenderer.compareFrames(frame1.path, frame2.path);

      if (result.success && result.comparison) {
        setComparisonResult({
          frame1: frame1.path,
          frame2: frame2.path,
          result: result.comparison
        });
      } else {
        alert(`Comparison failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Comparison error:', error);
      alert('Comparison failed due to an error');
    } finally {
      setIsDescribing(false);
    }
  };

  /**
   * Export comparison result
   */
  const handleExportComparison = async () => {
    if (!comparisonResult || !filePath) return;

    const data = {
      source_video: filePath,
      exported_at: new Date().toISOString(),
      start_frame: comparisonResult.frame1,
      end_frame: comparisonResult.frame2,
      analysis: comparisonResult.result
    };

    const outputDir = filePath + '_extracted';

    try {
      setIsExportingComparison(true);
      const result = await window.ipcRenderer.exportComparisonJson(outputDir, data);

      if (result.success) {
        alert(`Comparison exported to:\n${result.path}`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed');
    } finally {
      setIsExportingComparison(false);
    }
  };

  /**
   * Sequential Analysis (Analyze Flow) of ALL extracted frames
   */
  const handleAnalyzeFlow = async () => {
    if (frames.length < 2 || !filePath) return;

    setIsAnalyzingFlow(true);
    setFlowProgress({ current: 0, total: frames.length - 1 });
    setFlowResults(null);

    try {
      const imagePaths = frames.map(f => f.path);
      const result = await window.ipcRenderer.compareSequential(imagePaths);

      if (result.success && result.results) {
        setFlowResults(result.results);
      } else {
        alert('Sequential analysis failed: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Flow analysis error:', error);
      alert('An error occurred during flow analysis');
    } finally {
      setIsAnalyzingFlow(false);
      setFlowProgress(undefined);
    }
  };

  /**
   * Export the sequential flow report
   */
  const handleExportFlowReport = async () => {
    if (!flowResults || !filePath) return;

    const data = {
      source_video: filePath,
      exported_at: new Date().toISOString(),
      total_frames: frames.length,
      sequential_comparisons: flowResults
    };

    const outputDir = filePath + '_extracted';

    try {
      const result = await window.ipcRenderer.exportFlowReport(outputDir, data);
      if (result.success) {
        alert(`Flow report exported to:\n${result.path}`);
      } else {
        alert('Export failed: ' + result.error);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed');
    }
  };

  /**
   * Export analyzed frames data to JSON file
   */
  const handleExportJson = async () => {
    if (!filePath) return;

    // Build export data from analyzed frames
    const exportData = {
      source_video: filePath,
      exported_at: new Date().toISOString(),
      total_frames: frames.length,
      analyzed_frames: frames.filter(f => f.isAnalyzed).length,
      frames: frames
        .filter(f => f.isAnalyzed)
        .map(f => ({
          path: f.path,
          type: f.type,
          time: f.time,
          description: f.description,
          objects: f.objects,
          tags: f.tags,
          scene_type: f.scene_type,
          visual_elements: f.visual_elements
        }))
    };

    // Export to the same folder as extracted frames
    const outputDir = filePath + '_extracted';

    try {
      const result = await window.ipcRenderer.exportAnalysisJson(outputDir, exportData);

      if (result.success) {
        alert(`Analysis exported to:\n${result.path}`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed: ' + (error instanceof Error ? error.message : error));
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
    <div
      className="app-container"
      style={{
        minHeight: '100vh',
        backgroundColor: '#1e1e1e',
        color: '#eee',
        paddingBottom: '35px' // Space for status bar
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
      {/* Status Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 16px',
        backgroundColor: '#1e1e1e',
        borderBottom: '1px solid #333',
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ color: '#aaa' }}>
            Engine: <span style={{ color: aiStatusMessage.includes('Connected') ? '#4caf50' : '#f44336' }}>{aiStatusMessage}</span>
          </span>
          {analysisProgress && (
            <span style={{ color: '#007AFF' }}>
              Analyzing: {analysisProgress.current} / {analysisProgress.total}
            </span>
          )}
          {flowProgress && (
            <span style={{ color: '#6f42c1' }}>
              Flow: {flowProgress.current} / {flowProgress.total}
            </span>
          )}
        </div>
        {filePath && (
          <div style={{ color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
            {filePath}
          </div>
        )}
      </div>
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
              <span style={{
                color: aiStatusMessage.includes('Connected') ? '#4CAF50' : '#FF5252',
                fontWeight: 'bold'
              }}>
                {aiStatusMessage}
              </span>
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
            selectedModel="LM Studio (Local API)"
            onModelChange={handleModelChange}
            onAnalyzeFlow={handleAnalyzeFlow}
            isAnalyzingFlow={isAnalyzingFlow}
            framesCount={frames.length}
          />

          {/* Thumbnail Grid - flexible height, scrolls with page */}
          <ThumbnailGrid
            frames={frames}
            selectedIndices={selectedIndices}
            onSelectionChange={setSelectedIndices}
            onAnalyzeSelected={handleAnalyzeSelected}
            onAnalyzeAll={handleAnalyzeAll}
            onExportJson={handleExportJson}
            onCompareSelected={handleCompareSelected}
            isDescribing={isDescribing}
            analysisProgress={analysisProgress}
            hasAnalyzedFrames={frames.some(f => f.isAnalyzed)}
          />

          {/* Sequential Flow Report */}
          {flowResults && (
            <FlowReport
              results={flowResults}
              onClose={() => setFlowResults(null)}
              onExport={handleExportFlowReport}
            />
          )}

          {/* Comparison Modal */}
          {comparisonResult && comparisonResult.frame1 && comparisonResult.frame2 && (
            <ComparisonView
              frame1Path={comparisonResult.frame1}
              frame2Path={comparisonResult.frame2}
              comparisonResult={comparisonResult.result}
              onClose={() => setComparisonResult(null)}
              onExport={handleExportComparison}
              isExporting={isExportingComparison}
            />
          )}
        </>
      )}

      {/* Status Bar */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        backgroundColor: '#007AFF', // Blue accent
        color: 'white',
        fontSize: '0.8rem',
        padding: '5px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 1000,
        boxShadow: '0 -2px 5px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span><strong>AI Engine:</strong> LM Studio</span>
          {isDescribing ? (
            <span><strong>Status:</strong> Analyzing Frames...</span>
          ) : isProcessing ? (
            <span><strong>Status:</strong> Extracting Frames...</span>
          ) : (
            <span><strong>Status:</strong> {aiStatusMessage}</span>
          )}
        </div>
        <div>
          v1.0.0
        </div>
      </footer>
    </div>
  );
}

export default App;
