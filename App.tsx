
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

  const stateRef = useRef({
    tool: activeTool,
    color: strokeColor,
    width: strokeWidth,
    isDown: false,
    origX: 0,
    origY: 0,
    tempShape: null as any
  });

  // 同步 React 状态到 Ref，确保事件监听器拿到最新值
  useEffect(() => {
    stateRef.current.tool = activeTool;
    stateRef.current.color = strokeColor;
    stateRef.current.width = strokeWidth;
  }, [activeTool, strokeColor, strokeWidth]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const fbCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 500,
      backgroundColor: '#ffffff',
      selection: true,
    });
    fabricCanvasRef.current = fbCanvas;

    const createArrowPath = (x1: number, y1: number, x2: number, y2: number) => {
      const headLength = 20;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      return [
        'M', x1, y1,
        'L', x2, y2,
        'M', x2, y2,
        'L', x2 - headLength * Math.cos(angle - Math.PI / 7), y2 - headLength * Math.sin(angle - Math.PI / 7),
        'M', x2, y2,
        'L', x2 - headLength * Math.cos(angle + Math.PI / 7), y2 - headLength * Math.sin(angle + Math.PI / 7)
      ].join(' ');
    };

    fbCanvas.on('mouse:down', (o: any) => {
      const { tool, color, width } = stateRef.current;
      
      // 如果点击的是已有物体，且处于选择模式，不执行创建逻辑
      if (tool === ToolType.SELECT || tool === ToolType.PENCIL || tool === ToolType.ERASER || tool === ToolType.TEXT) return;
      if (o.target && tool !== ToolType.SELECT) {
          // 如果正在尝试画形状但点到了别的物体，暂时禁用选择以确保能画出新形状
          fbCanvas.discardActiveObject();
      }

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
        selectable: false, // 绘制过程中不可选
        evented: false,
        strokeLineCap: 'round',
        strokeLineJoin: 'round'
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
          shape = new fabric.Path(createArrowPath(pointer.x, pointer.y, pointer.x, pointer.y), { ...common });
          break;
      }

      if (shape) {
        stateRef.current.tempShape = shape;
        fbCanvas.add(shape);
        fbCanvas.renderAll();
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
          tempShape.set({ left, top, width: width, height: height });
          break;
        case ToolType.CIRCLE:
          tempShape.set({ left, top, radius: Math.max(width, height) / 2 });
          break;
        case ToolType.ELLIPSE:
          tempShape.set({ left, top, rx: width / 2, ry: height / 2 });
          break;
        case ToolType.ARROW:
          const newPath = createArrowPath(origX, origY, pointer.x, pointer.y);
          tempShape.set({ path: fabric.util.parsePath(newPath) });
          // 更新路径包围盒
          const dims = tempShape._parseDimensions();
          tempShape.set({
            width: dims.width,
            height: dims.height,
            left: dims.left,
            top: dims.top,
            pathOffset: { x: dims.left + dims.width / 2, y: dims.top + dims.height / 2 }
          });
          break;
      }

      fbCanvas.renderAll();
    });

    fbCanvas.on('mouse:up', () => {
      if (!stateRef.current.isDown) return;
      stateRef.current.isDown = false;
      
      const { tempShape, tool } = stateRef.current;

      if (tempShape) {
        // 如果绘制得太小（只是点了一下），则移除，防止误点生成一堆小圆圈
        const isTiny = (tempShape.width < 5 && tempShape.height < 5) && tool !== ToolType.ARROW;
        
        if (isTiny) {
          fbCanvas.remove(tempShape);
        } else {
          tempShape.set({ selectable: true, evented: true });
          tempShape.setCoords();
          // 关键改进：绘图完成后自动切换到“选择”工具，方便用户拉伸调整
          setActiveTool(ToolType.SELECT);
          fbCanvas.setActiveObject(tempShape);
        }
        
        stateRef.current.tempShape = null;
        fbCanvas.renderAll();
      }
    });

    fbCanvas.on('mouse:down:before', (o: any) => {
      if (stateRef.current.tool !== ToolType.TEXT) return;
      const pointer = fbCanvas.getPointer(o.e);
      const text = new fabric.IText('双击编辑文字', {
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

  // 响应式更新画布交互状态
  useEffect(() => {
    const fbCanvas = fabricCanvasRef.current;
    if (!fbCanvas) return;

    fbCanvas.isDrawingMode = activeTool === ToolType.PENCIL || activeTool === ToolType.ERASER;
    
    if (fbCanvas.isDrawingMode) {
      fbCanvas.freeDrawingBrush = new fabric.PencilBrush(fbCanvas);
      fbCanvas.freeDrawingBrush.width = activeTool === ToolType.ERASER ? strokeWidth * 4 : strokeWidth;
      fbCanvas.freeDrawingBrush.color = activeTool === ToolType.ERASER ? '#ffffff' : strokeColor;
    }

    const isEditing = activeTool === ToolType.SELECT;
    fbCanvas.selection = isEditing;
    fbCanvas.forEachObject((obj: any) => {
      // 只有在选择模式下，物体才可被交互
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
      setActiveTool(ToolType.PENCIL);
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
      setError("请输入描述词。");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const dataUrl = fabricCanvasRef.current.toDataURL({ format: 'png', quality: 1 });
      const resultUrl = await generateImageFromSketch(dataUrl, prompt);
      setGeneratedResult({ url: resultUrl, prompt, timestamp: Date.now() });
    } catch (err: any) {
      setError("AI生成失败，请检查网络。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedResult) return;
    const link = document.createElement('a');
    link.href = generatedResult.url;
    link.download = `doodle-art-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-200">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-gray-800 text-lg tracking-tight">Doodle Genius AI</h1>
        </div>
        
        <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200/50">
          <ToolBtn icon={<MousePointer2 />} active={activeTool === ToolType.SELECT} onClick={() => setActiveTool(ToolType.SELECT)} title="选择/调整" />
          <div className="w-px h-5 bg-gray-300 mx-1"></div>
          <ToolBtn icon={<Pencil />} active={activeTool === ToolType.PENCIL} onClick={() => setActiveTool(ToolType.PENCIL)} title="画笔" />
          <ToolBtn icon={<Eraser />} active={activeTool === ToolType.ERASER} onClick={() => setActiveTool(ToolType.ERASER)} title="橡皮擦" />
          <div className="w-px h-5 bg-gray-300 mx-1"></div>
          <ToolBtn icon={<Square />} active={activeTool === ToolType.RECTANGLE} onClick={() => setActiveTool(ToolType.RECTANGLE)} title="矩形" />
          <ToolBtn icon={<CircleIcon />} active={activeTool === ToolType.CIRCLE} onClick={() => setActiveTool(ToolType.CIRCLE)} title="圆形" />
          <ToolBtn icon={<Maximize2 className="rotate-45" />} active={activeTool === ToolType.ELLIPSE} onClick={() => setActiveTool(ToolType.ELLIPSE)} title="椭圆" />
          <ToolBtn icon={<ArrowUpRight />} active={activeTool === ToolType.ARROW} onClick={() => setActiveTool(ToolType.ARROW)} title="箭头" />
          <ToolBtn icon={<Type />} active={activeTool === ToolType.TEXT} onClick={() => setActiveTool(ToolType.TEXT)} title="文本" />
        </div>

        <div className="flex gap-2">
          <button onClick={handleDelete} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="删除选中物体"><Trash2 className="w-5 h-5" /></button>
          <button onClick={handleClear} className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="重置画布"><RotateCcw className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="flex-1 flex gap-6 p-6 overflow-hidden">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-200 flex items-center justify-center relative overflow-hidden group">
             <div className="bg-white shadow-2xl ring-1 ring-gray-200 rounded-sm">
               <canvas ref={canvasRef} />
             </div>
             
             {/* Floating Controls */}
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-white/90 backdrop-blur-md px-8 py-3.5 rounded-3xl shadow-2xl border border-gray-100 transform transition-all hover:scale-105">
               <div className="flex items-center gap-3">
                 <div className="flex flex-col">
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Color</span>
                   <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer border-2 border-white shadow-sm ring-1 ring-gray-100 p-0 overflow-hidden" />
                 </div>
               </div>
               <div className="w-px h-8 bg-gray-200"></div>
               <div className="flex items-center gap-4">
                 <div className="flex flex-col flex-1">
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Size</span>
                   <div className="flex items-center gap-3">
                    <input type="range" min="1" max="40" value={strokeWidth} onChange={e => setStrokeWidth(parseInt(e.target.value))} className="w-28 accent-indigo-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                    <span className="text-sm font-bold text-indigo-600 tabular-nums w-5">{strokeWidth}</span>
                   </div>
                 </div>
               </div>
             </div>

             {activeTool !== ToolType.SELECT && (
               <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg animate-bounce pointer-events-none">
                 正在使用{activeTool === ToolType.ELLIPSE ? '椭圆' : 
                          activeTool === ToolType.RECTANGLE ? '矩形' : 
                          activeTool === ToolType.CIRCLE ? '圆形' : 
                          activeTool === ToolType.ARROW ? '箭头' : '绘图'}工具 - 拖拽来绘制
               </div>
             )}
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-lg border border-gray-200 flex gap-4 transform transition-all focus-within:ring-2 focus-within:ring-indigo-100">
            <textarea 
              value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="描述您的创意：例如 '一只戴着皇冠的可爱猫咪，3D渲染风格'..."
              className="flex-1 p-3 bg-gray-50/50 border-none rounded-2xl focus:ring-0 outline-none resize-none text-sm leading-relaxed min-h-[90px] placeholder:text-gray-400"
            />
            <button 
              onClick={handleGenerate} disabled={isGenerating}
              className={`px-10 rounded-2xl font-bold text-white shadow-lg transition-all flex flex-col items-center justify-center gap-2 group
                ${isGenerating ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-200'}`}
            >
              {isGenerating ? <Loader2 className="w-7 h-7 animate-spin" /> : <><Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" /><span className="text-sm">生成杰作</span></>}
            </button>
          </div>
        </div>

        <div className="w-[380px] flex flex-col gap-6">
          <div className="flex-1 bg-white rounded-3xl border border-gray-200 shadow-xl flex flex-col overflow-hidden">
            <div className="p-5 border-b bg-gray-50/50 flex items-center justify-between">
              <h2 className="font-bold text-sm text-gray-700 flex items-center gap-2.5">
                <ImageIcon className="w-5 h-5 text-indigo-500" />
                AI 创作中心
              </h2>
              {generatedResult && (
                <button onClick={handleDownload} className="text-indigo-600 hover:bg-indigo-50 p-2.5 rounded-xl transition-colors">
                  <Download className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="flex-1 flex items-center justify-center p-6 bg-gray-50/30">
              {isGenerating ? (
                <div className="text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
                    <Sparkles className="w-6 h-6 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-600">正在构思场景...</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">请稍候片刻</p>
                  </div>
                </div>
              ) : generatedResult ? (
                <div className="w-full h-full flex flex-col gap-5">
                  <div className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-white aspect-[4/3] bg-white transition-transform hover:scale-[1.02]">
                    <img src={generatedResult.url} className="w-full h-full object-contain" alt="Generated Art" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-8">
                      <button onClick={handleDownload} className="bg-white text-gray-900 px-8 py-2.5 rounded-full font-bold shadow-2xl hover:bg-indigo-50 transition-colors flex items-center gap-2 text-sm">
                        <Download className="w-4 h-4" /> 保存高清原图
                      </button>
                    </div>
                  </div>
                  <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 shadow-inner">
                    <p className="text-[10px] font-black text-indigo-300 uppercase mb-2 tracking-[0.2em]">Prompt</p>
                    <p className="text-xs text-indigo-900 italic leading-relaxed line-clamp-4 font-medium">"{generatedResult.prompt}"</p>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4 opacity-40 group-hover:opacity-60 transition-opacity">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                    <ImageIcon className="w-10 h-10 text-gray-300" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-400">准备就绪</p>
                    <p className="text-[10px] text-gray-300 uppercase tracking-widest">在画布上开始您的涂鸦之旅</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-3xl text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
            <h3 className="font-bold text-sm mb-2.5 flex items-center gap-2"><Sparkles className="w-4 h-4" /> 操作提示</h3>
            <ul className="text-[11px] text-indigo-50 space-y-2 leading-snug">
              <li className="flex gap-2"><span>•</span> 绘制形状后，鼠标会自动切换为“选择”模式。</li>
              <li className="flex gap-2"><span>•</span> 点击并拖动形状周围的蓝点可以调整大小或压扁成椭圆。</li>
              <li className="flex gap-2"><span>•</span> 文本工具：点击画布后双击即可输入文字。</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

const ToolBtn: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void; title: string }> = ({ icon, active, onClick, title }) => (
  <button 
    onClick={onClick}
    title={title}
    className={`p-3 rounded-xl transition-all duration-200 group relative ${active ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-200/50 scale-105 z-10' : 'text-gray-400 hover:text-indigo-500 hover:bg-white/50'}`}
  >
    {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
  </button>
);

export default App;
