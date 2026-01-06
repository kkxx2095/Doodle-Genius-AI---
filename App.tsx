
import React, { useEffect, useRef, useState } from 'react';
import { 
  Pencil, 
  Square, 
  Circle as CircleIcon, 
  MousePointer2, 
  Type, 
  ArrowUpRight, 
  Trash2, 
  Download, 
  Sparkles, 
  RotateCcw,
  Maximize2,
  Image as ImageIcon,
  Loader2,
  Eraser
} from 'lucide-react';
import { ToolType, GeneratedImage } from './types';
import { generateImageFromSketch } from './services/geminiService';

declare const fabric: any;

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.PENCIL);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use refs for logic inside event listeners to avoid stale closures
  const stateRef = useRef({
    tool: activeTool,
    color: strokeColor,
    width: strokeWidth,
    isDown: false,
    origX: 0,
    origY: 0,
    tempShape: null as any
  });

  // Sync state with ref
  useEffect(() => {
    stateRef.current.tool = activeTool;
    stateRef.current.color = strokeColor;
    stateRef.current.width = strokeWidth;
  }, [activeTool, strokeColor, strokeWidth]);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Canvas
    const fbCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 500,
      backgroundColor: '#ffffff',
      selection: true,
    });
    fabricCanvasRef.current = fbCanvas;

    // Event Handlers
    fbCanvas.on('mouse:down', (o: any) => {
      const { tool, color, width } = stateRef.current;
      if (tool === ToolType.SELECT || tool === ToolType.PENCIL || tool === ToolType.ERASER || tool === ToolType.TEXT) return;

      stateRef.current.isDown = true;
      const pointer = fbCanvas.getPointer(o.e);
      stateRef.current.origX = pointer.x;
      stateRef.current.origY = pointer.y;

      const common = {
        left: pointer.x,
        top: pointer.y,
        stroke: color,
        strokeWidth: width,
        fill: 'transparent',
        selectable: false, // Disable selection during drawing
        evented: false,
      };

      let shape;
      switch (tool) {
        case ToolType.RECTANGLE:
          shape = new fabric.Rect({ ...common, width: 0, height: 0 });
          break;
        case ToolType.CIRCLE:
          shape = new fabric.Circle({ ...common, radius: 0 });
          break;
        case ToolType.ELLIPSE:
          shape = new fabric.Ellipse({ ...common, rx: 0, ry: 0 });
          break;
        case ToolType.ARROW:
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], { ...common });
          break;
      }

      if (shape) {
        stateRef.current.tempShape = shape;
        fbCanvas.add(shape);
      }
    });

    fbCanvas.on('mouse:move', (o: any) => {
      if (!stateRef.current.isDown || !stateRef.current.tempShape) return;
      const pointer = fbCanvas.getPointer(o.e);
      const { tool, origX, origY, tempShape } = stateRef.current;

      const left = Math.min(origX, pointer.x);
      const top = Math.min(origY, pointer.y);
      const width = Math.abs(origX - pointer.x);
      const height = Math.abs(origY - pointer.y);

      switch (tool) {
        case ToolType.RECTANGLE:
          tempShape.set({ left, top, width, height });
          break;
        case ToolType.CIRCLE:
          tempShape.set({ left, top, radius: Math.max(width, height) / 2 });
          break;
        case ToolType.ELLIPSE:
          tempShape.set({ left, top, rx: width / 2, ry: height / 2 });
          break;
        case ToolType.ARROW:
          tempShape.set({ x2: pointer.x, y2: pointer.y });
          break;
      }

      fbCanvas.renderAll();
    });

    fbCanvas.on('mouse:up', () => {
      if (!stateRef.current.isDown) return;
      stateRef.current.isDown = false;
      if (stateRef.current.tempShape) {
        stateRef.current.tempShape.set({ selectable: true, evented: true });
        stateRef.current.tempShape.setCoords();
        stateRef.current.tempShape = null;
        fbCanvas.renderAll();
      }
    });

    // Handle Text tool specifically
    fbCanvas.on('mouse:down:before', (o: any) => {
      if (stateRef.current.tool !== ToolType.TEXT) return;
      const pointer = fbCanvas.getPointer(o.e);
      const text = new fabric.IText('Double click to edit', {
        left: pointer.x,
        top: pointer.y,
        fontFamily: 'Inter',
        fontSize: 24,
        fill: stateRef.current.color,
      });
      fbCanvas.add(text);
      fbCanvas.setActiveObject(text);
      setActiveTool(ToolType.SELECT);
    });

    return () => {
      fbCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  // Update Canvas Properties when Tool/Color changes
  useEffect(() => {
    const fbCanvas = fabricCanvasRef.current;
    if (!fbCanvas) return;

    fbCanvas.isDrawingMode = activeTool === ToolType.PENCIL || activeTool === ToolType.ERASER;
    
    if (fbCanvas.isDrawingMode) {
      fbCanvas.freeDrawingBrush = new fabric.PencilBrush(fbCanvas);
      fbCanvas.freeDrawingBrush.width = activeTool === ToolType.ERASER ? strokeWidth * 4 : strokeWidth;
      fbCanvas.freeDrawingBrush.color = activeTool === ToolType.ERASER ? '#ffffff' : strokeColor;
    }

    // Toggle interaction based on tool
    const isEditing = activeTool === ToolType.SELECT;
    fbCanvas.selection = isEditing;
    fbCanvas.forEachObject((obj: any) => {
      obj.selectable = isEditing;
      obj.evented = isEditing;
    });

    fbCanvas.defaultCursor = isEditing ? 'default' : 'crosshair';
    fbCanvas.renderAll();
  }, [activeTool, strokeColor, strokeWidth]);

  const handleClear = () => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.clear();
      fabricCanvasRef.current.setBackgroundColor('#ffffff', fabricCanvasRef.current.renderAll.bind(fabricCanvasRef.current));
    }
  };

  const handleDelete = () => {
    if (fabricCanvasRef.current) {
      const activeObjects = fabricCanvasRef.current.getActiveObjects();
      fabricCanvasRef.current.remove(...activeObjects);
      fabricCanvasRef.current.discardActiveObject().renderAll();
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please describe what to generate.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const dataUrl = fabricCanvasRef.current.toDataURL({ format: 'png', quality: 1 });
      const resultUrl = await generateImageFromSketch(dataUrl, prompt);
      setGeneratedResult({ url: resultUrl, prompt, timestamp: Date.now() });
    } catch (err: any) {
      setError(err.message || "AI Error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedResult) return;
    const link = document.createElement('a');
    link.href = generatedResult.url;
    link.download = `doodle-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header UI */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-600" />
          <h1 className="font-bold text-gray-800 tracking-tight">Doodle Genius AI</h1>
        </div>
        
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          <ToolBtn icon={<MousePointer2 />} active={activeTool === ToolType.SELECT} onClick={() => setActiveTool(ToolType.SELECT)} />
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <ToolBtn icon={<Pencil />} active={activeTool === ToolType.PENCIL} onClick={() => setActiveTool(ToolType.PENCIL)} />
          <ToolBtn icon={<Eraser />} active={activeTool === ToolType.ERASER} onClick={() => setActiveTool(ToolType.ERASER)} />
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <ToolBtn icon={<Square />} active={activeTool === ToolType.RECTANGLE} onClick={() => setActiveTool(ToolType.RECTANGLE)} />
          <ToolBtn icon={<CircleIcon />} active={activeTool === ToolType.CIRCLE} onClick={() => setActiveTool(ToolType.CIRCLE)} />
          <ToolBtn icon={<Maximize2 className="rotate-45" />} active={activeTool === ToolType.ELLIPSE} onClick={() => setActiveTool(ToolType.ELLIPSE)} />
          <ToolBtn icon={<ArrowUpRight />} active={activeTool === ToolType.ARROW} onClick={() => setActiveTool(ToolType.ARROW)} />
          <ToolBtn icon={<Type />} active={activeTool === ToolType.TEXT} onClick={() => setActiveTool(ToolType.TEXT)} />
        </div>

        <div className="flex gap-2">
          <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
          <button onClick={handleClear} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><RotateCcw className="w-5 h-5" /></button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex gap-6 p-6 overflow-hidden">
        {/* Canvas Section */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex-1 bg-white rounded-2xl shadow-inner border-2 border-dashed border-gray-200 flex items-center justify-center relative overflow-hidden p-4">
             <div className="shadow-2xl ring-1 ring-gray-200">
               <canvas ref={canvasRef} />
             </div>
             
             {/* Floating Controls */}
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-white/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-xl border border-gray-100">
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Color</span>
                 <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} className="w-7 h-7 rounded-full cursor-pointer border-none p-0 overflow-hidden" />
               </div>
               <div className="w-px h-6 bg-gray-200"></div>
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Stroke</span>
                 <input type="range" min="1" max="40" value={strokeWidth} onChange={e => setStrokeWidth(parseInt(e.target.value))} className="w-24 accent-indigo-600" />
                 <span className="text-xs font-bold text-indigo-600 min-w-[20px]">{strokeWidth}</span>
               </div>
             </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex gap-4">
            <textarea 
              value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="What should this doodle transform into?"
              className="flex-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm leading-relaxed min-h-[80px]"
            />
            <button 
              onClick={handleGenerate} disabled={isGenerating}
              className={`px-10 rounded-xl font-bold text-white shadow-lg transition-all flex flex-col items-center justify-center gap-1
                ${isGenerating ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
            >
              {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Sparkles className="w-5 h-5" /><span>Generate</span></>}
            </button>
          </div>
        </div>

        {/* Sidebar Results */}
        <div className="w-[360px] flex flex-col gap-6">
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-2"><ImageIcon className="w-4 h-4 text-indigo-500" />AI Result</h2>
              {generatedResult && <button onClick={handleDownload} className="text-indigo-600 hover:bg-indigo-100 p-2 rounded-lg transition-colors"><Download className="w-4 h-4" /></button>}
            </div>
            
            <div className="flex-1 flex items-center justify-center p-4 bg-gray-50/50">
              {isGenerating ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm font-semibold text-gray-400">Dreaming up your art...</p>
                </div>
              ) : generatedResult ? (
                <div className="w-full h-full flex flex-col gap-4">
                  <div className="relative group rounded-xl overflow-hidden shadow-lg border border-white aspect-[4/3] bg-white">
                    <img src={generatedResult.url} className="w-full h-full object-contain" alt="Generated" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button onClick={handleDownload} className="bg-white text-gray-900 px-6 py-2 rounded-full font-bold shadow-2xl hover:scale-105 transition-transform text-sm">Download High Res</button>
                    </div>
                  </div>
                  <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1 tracking-widest">Base Prompt</p>
                    <p className="text-xs text-indigo-900 italic line-clamp-3">"{generatedResult.prompt}"</p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-300 opacity-60">
                  <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                  <p className="text-xs font-medium">Your masterpiece will appear here</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-indigo-900 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
            <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" />Tip</h3>
            <p className="text-xs text-indigo-100 leading-relaxed">Combine simple shapes like circles and rectangles with specific text prompts to guide the AI more accurately!</p>
          </div>
        </div>
      </main>
    </div>
  );
};

const ToolBtn: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`p-2.5 rounded-lg transition-all ${active ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200 scale-110' : 'text-gray-400 hover:text-indigo-400'}`}
  >
    {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
  </button>
);

export default App;
