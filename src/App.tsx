import React, { useState, useRef, useCallback, useEffect, useMemo, ChangeEvent, DragEvent } from 'react';
import { 
  Upload, 
  Download, 
  RefreshCw,
  X,
  FileImage,
  ArrowRight,
  FileText,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Layers,
  Zap,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';

type ImageResults = {
  jpg: { dataUrl: string; size: number };
  png: { dataUrl: string; size: number };
  pdf: { dataUrl: string; size: number };
};

type OutputFormat = 'jpg' | 'jpeg' | 'pdf' | 'png';

type ImageItem = {
  id: string;
  original: File;
  preview: string;
  width: number;
  height: number;
  results: ImageResults | null;
  isProcessing: boolean;
  isDownloaded?: boolean;
  // Per-item settings
  targetValue: string;
  targetUnit: 'KB' | 'MB';
  customName: string;
  format: OutputFormat;
};

const ShrinkLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
    <Zap className="w-full h-full text-blue-400 fill-blue-400 animate-pulse relative z-10" />
    <div className="absolute -bottom-1 text-[6px] font-black tracking-widest text-blue-300 uppercase whitespace-nowrap bg-blue-900/80 px-1 rounded">
      Shrink Size
    </div>
  </div>
);

const SplashScreen = ({ onComplete }: { onComplete: () => void; key?: string }) => (
  <motion.div 
    initial={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onAnimationComplete={() => onComplete()}
    className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-hidden"
  >
    <motion.div 
      animate={{ 
        scale: [1, 1.1, 1],
        filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"]
      }}
      transition={{ repeat: Infinity, duration: 2 }}
      className="relative z-10"
    >
      <ShrinkLogo className="w-32 h-32" />
    </motion.div>
    
    <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center">
      <motion.h1 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-black tracking-tighter uppercase mb-1"
      >
        ShrinkShift<span className="text-blue-500 italic">PRO</span>
      </motion.h1>
      <p className="text-blue-400 font-bold tracking-[0.2em] text-[8px] uppercase opacity-70">
        Any Format • Max Speed • 100% Secure
      </p>
    </div>
  </motion.div>
);

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const totalSavedBytes = useMemo(() => {
    return images.reduce((acc, img) => {
      if (img.results) return acc + (img.original.size - img.results.jpg.size);
      return acc;
    }, 0);
  }, [images]);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i === 0) return bytes + ' Bytes';
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement> | DragEvent) => {
    let files: FileList | null = null;
    if ('dataTransfer' in e) { e.preventDefault(); files = e.dataTransfer.files; }
    else { files = e.target.files; }

    if (files) {
      const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
      let currentTotalSize = images.reduce((acc, img) => acc + img.original.size, 0);
      
      const newFiles = Array.from(files)
        .filter(f => f.type.startsWith('image/') || f.type.startsWith('application/pdf'))
        .filter(file => {
          if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
            alert(`Total limit of 50MB reached. Cannot add ${file.name}`);
            return false;
          }
          currentTotalSize += file.size;
          return true;
        })
        .slice(0, 15 - images.length);

      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const newItem: ImageItem = {
              id: Math.random().toString(36).substr(2, 9),
              original: file,
              preview: event.target?.result as string,
              width: img.width, height: img.height,
              results: null, isProcessing: false,
              targetValue: "50",
              targetUnit: "KB",
              customName: file.name.split('.')[0],
              format: 'jpg'
            };
            setImages(prev => [...prev, newItem].slice(0, 10));
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const processSingleImage = useCallback(async (item: ImageItem) => {
    const sizeKb = item.targetUnit === 'KB' ? parseFloat(item.targetValue) : parseFloat(item.targetValue) * 1024;
    
    setImages(prev => prev.map(img => img.id === item.id ? { ...img, isProcessing: true } : img));
    
    const img = new Image();
    img.src = item.preview;
    await new Promise((resolve) => (img.onload = resolve));
    const canvas = document.createElement('canvas');
    canvas.width = item.width; canvas.height = item.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);

    let low = 0.01; let high = 1.0;
    let bestJpg = { dataUrl: '', size: 0 };
    
    for (let i = 0; i < 7; i++) {
      const mid = (low + high) / 2;
      const dataUrl = canvas.toDataURL('image/jpeg', mid);
      const size = atob(dataUrl.split(',')[1]).length;
      if (size / 1024 <= sizeKb) { bestJpg = { dataUrl, size }; low = mid; }
      else { high = mid; }
    }
    
    if (!bestJpg.dataUrl) {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.01);
      bestJpg = { dataUrl, size: atob(dataUrl.split(',')[1]).length };
    }

    const pngDataUrl = canvas.toDataURL('image/png');
    const pngSize = atob(pngDataUrl.split(',')[1]).length;
    const pdf = new jsPDF({ orientation: item.width > item.height ? 'l' : 'p', unit: 'px', format: [item.width, item.height] });
    pdf.addImage(bestJpg.dataUrl, 'JPEG', 0, 0, item.width, item.height);
    const pdfBlob = pdf.output('blob');
    const pdfDataUrl = URL.createObjectURL(pdfBlob);

    const results = { jpg: bestJpg, png: { dataUrl: pngDataUrl, size: pngSize }, pdf: { dataUrl: pdfDataUrl, size: pdfBlob.size } };
    
    setImages(prev => prev.map(img => img.id === item.id ? { ...img, results, isProcessing: false } : img));
    return results;
  }, []);

  const initiateDownload = async (item: ImageItem) => {
    let currentResults = item.results;
    if (!currentResults) {
      currentResults = await processSingleImage(item);
    }
    if (!currentResults) return;

    let dataUrl = "";
    let ext = item.format;
    
    if (ext === 'jpg' || ext === 'jpeg') dataUrl = currentResults.jpg.dataUrl;
    else if (ext === 'png') dataUrl = currentResults.png.dataUrl;
    else if (ext === 'pdf') dataUrl = currentResults.pdf.dataUrl;

    const link = document.createElement('a');
    link.style.display = 'none';
    link.download = `${item.customName}.${ext}`;
    link.href = dataUrl;
    
    document.body.appendChild(link);
    link.click();
    
    // Mini delay before cleanup to ensure trigger
    setTimeout(() => {
      document.body.removeChild(link);
      setImages(prev => prev.map(img => img.id === item.id ? { ...img, isDownloaded: true } : img));
    }, 150);
  };

  const updateItem = (id: string, updates: Partial<ImageItem>) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, ...updates, results: null } : img));
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  useEffect(() => {
    const timer = setTimeout(() => setIsInitializing(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 pb-20 font-sans">
      <AnimatePresence>{isInitializing && <SplashScreen key="splash" onComplete={() => {}} />}</AnimatePresence>

      <nav className={`bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 transition-all duration-500 border-b border-slate-800 ${scrolled ? 'py-2 px-4 shadow-xl' : 'py-4 px-6'}`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShrinkLogo className={`${scrolled ? 'w-6 h-6' : 'w-10 h-10'}`} />
            <div className={scrolled ? 'hidden sm:block' : ''}>
              <h1 className={`${scrolled ? 'text-sm' : 'text-lg'} font-black tracking-tighter uppercase text-white`}>SHRINKSHIFT PRO</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!scrolled && (
              <>
                <div className="hidden lg:flex bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">100% LOCAL & SECURE</span>
                </div>
                {images.length > 0 && (
                  <div className="bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                    <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">Saved: {formatSize(totalSavedBytes)}</span>
                  </div>
                )}
              </>
            )}
            
            <AnimatePresence>
              {deferredPrompt && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleInstallClick}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-lg shadow-blue-500/20"
                >
                  <Download className="w-3 h-3" /> INSTALL
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* New Upload Controls Center */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col items-center">
            <div className="flex justify-center w-full">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-md bg-blue-600 hover:bg-blue-500 text-white p-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-blue-900/40"
                >
                    <Upload className="w-6 h-6" /> UPLOAD FILES
                </button>
            </div>
            
            <div className="mt-5 text-center px-4">
                <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">
                    Maximum total upload limit: 50MB
                </p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                    Browser-based processing • 100% Secure • No data leaves your device
                </p>
            </div>
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" />
        </div>

        <div className="grid gap-5">
          <AnimatePresence>
            {images.map((item, index) => (
              <motion.div 
                key={item.id} layout initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-xl group hover:border-slate-700 transition-colors"
              >
                {/* Image Section */}
                <div className="md:w-32 bg-slate-800 relative shrink-0">
                  <img src={item.preview} className="w-full h-full object-cover aspect-video md:aspect-square" />
                  <button onClick={() => removeImage(item.id)} className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white hover:bg-red-500 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                  {item.isProcessing && (
                    <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center backdrop-blur-[2px]">
                      <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Per-Image Controls */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[10px] font-black text-white uppercase truncate mb-1">Original: {item.original.name}</h4>
                      <div className="flex gap-2">
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded uppercase">{formatSize(item.original.size)}</span>
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded uppercase">{item.width}x{item.height}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                        <span className="text-[8px] font-black text-white px-2">RENAME:</span>
                        <input 
                            type="text" 
                            value={item.customName}
                            onChange={(e) => updateItem(item.id, { customName: e.target.value })}
                            className="bg-transparent text-[10px] font-bold border-none focus:outline-none text-blue-400 w-24"
                        />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-800/50">
                    {/* Format Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mr-1">FORMAT:</span>
                        {(['jpg', 'jpeg', 'png', 'pdf'] as const).map(f => (
                            <button 
                                key={f}
                                onClick={() => updateItem(item.id, { format: f })}
                                className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all ${item.format === f ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    <div className="h-4 w-px bg-slate-700 hidden sm:block" />

                    {/* Target Size Input */}
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">SIZE:</span>
                        <input 
                            type="text"
                            value={item.targetValue}
                            onChange={(e) => updateItem(item.id, { targetValue: e.target.value.replace(/[^0-9.]/g, '') })}
                            className="bg-slate-950 text-blue-400 font-bold text-[10px] w-10 p-1 rounded border border-slate-800 focus:border-blue-500 focus:outline-none text-center"
                        />
                        <button 
                            onClick={() => updateItem(item.id, { targetUnit: item.targetUnit === 'KB' ? 'MB' : 'KB' })}
                            className="bg-slate-700 px-2 py-1 rounded text-[8px] font-black text-white hover:bg-slate-600"
                        >
                            {item.targetUnit}
                        </button>
                    </div>

                    <div className="ml-auto flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                        {item.results && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <span className="text-[10px] font-black text-green-400 uppercase tracking-tighter">{formatSize(item.results.jpg.size)}</span>
                                <span className="text-[8px] font-bold text-green-400 opacity-60">RESZIED</span>
                            </div>
                        )}
                        <button 
                            onClick={() => initiateDownload(item)}
                            disabled={item.isProcessing}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-900/20 ${
                              item.isProcessing 
                                ? 'bg-slate-800 text-slate-500' 
                                : item.isDownloaded 
                                  ? 'bg-green-600 hover:bg-green-500 text-white' 
                                  : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                        >
                            {item.isProcessing ? (
                                <>
                                    <RefreshCw className="w-3 h-3 animate-spin" /> PROCESSING...
                                </>
                            ) : item.isDownloaded ? (
                                <>
                                    <Check className="w-3 h-3" /> DOWNLOADED
                                </>
                            ) : (
                                <>
                                    <Download className="w-3 h-3" /> DOWNLOAD
                                </>
                            )}
                        </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {images.length === 0 && (
          <div className="py-20 text-center opacity-40">
            <Zap className="w-16 h-16 text-slate-800 mx-auto mb-4" />
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-[0.3em]">Drop Files To Begin</h3>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 w-full p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-900 flex justify-center items-center z-40">
        <div className="flex gap-8 text-slate-600 font-black text-[9px] uppercase tracking-[0.3em]">
          <span>⚡ Lightning Fast</span>
          <span>🔒 100% Client-Side</span>
          <span>📁 Any Format</span>
        </div>
      </footer>
    </div>
  );
}

