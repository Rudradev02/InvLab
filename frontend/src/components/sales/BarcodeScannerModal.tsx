import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  CameraOff,
  Keyboard,
  Barcode as BarcodeIcon,
  CheckCircle2,
  AlertCircle,
  X,
  Volume2,
  VolumeX,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Product, StockLevel } from '../../types';
import { formatCurrency } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductScanned: (product: Product) => void;
  availableStock: StockLevel[];
}

function playBeep(success = true) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    if (success) {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // AudioContext might be blocked until user gesture; ignore silently
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onProductScanned,
  availableStock,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreateProduct = user?.role === 'Admin' || user?.role === 'Warehouse Manager';

  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState<{
    product: Product;
    stock: number;
  } | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  // Handle barcode lookup & validation
  const processBarcode = useCallback(
    async (code: string) => {
      const cleanCode = code.trim();
      if (!cleanCode || isProcessing) return;

      // Prevent immediate duplicate scans within 1.5 seconds
      const now = Date.now();
      if (
        cleanCode.toLowerCase() === lastScannedCodeRef.current.toLowerCase() &&
        now - lastScannedTimeRef.current < 1500
      ) {
        return;
      }

      setIsProcessing(true);
      lastScannedCodeRef.current = cleanCode;
      lastScannedTimeRef.current = now;

      try {
        const product = await apiRequest<Product>(
          `products/lookup-barcode/?barcode=${encodeURIComponent(cleanCode)}`
        );

        // Check stock availability in currently selected warehouse
        const stockItem = availableStock.find((s) => s.product.id === product.id);
        const qty = stockItem ? stockItem.quantity : 0;

        if (qty <= 0) {
          if (soundEnabled) playBeep(false);
          toast.error(
            `"${product.name}" (${product.sku}) is OUT OF STOCK in this warehouse.`
          );
          return;
        }

        // Success!
        if (soundEnabled) playBeep(true);
        onProductScanned(product);
        setLastScannedProduct({ product, stock: qty });
        toast.success(`Scanned: ${product.name} (Added to ticket)`);
        setManualCode('');
      } catch (err: any) {
        if (soundEnabled) playBeep(false);
        const isNotFound = err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('404');
        if (isNotFound) {
          toast.error(`No product found for barcode "${cleanCode}".`, {
            action: canCreateProduct
              ? {
                  label: 'Add Product',
                  onClick: () => {
                    onClose();
                    navigate('/inventory');
                  },
                }
              : undefined,
          });
        } else {
          toast.error(err.message || 'Error looking up barcode.');
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [availableStock, canCreateProduct, isProcessing, navigate, onClose, onProductScanned, soundEnabled]
  );

  // Stop camera stream safely
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);

    // Check secure context
    if (
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setCameraError(
        'Camera access requires a secure HTTPS connection outside localhost. Please use USB scanner or manual entry.'
      );
      setActiveTab('manual');
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Camera API is not supported in this browser environment.');
      setActiveTab('manual');
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in browser settings.');
      } else {
        setCameraError(`Camera error: ${err.message || 'Unable to open camera.'}`);
      }
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  // BarcodeDetector loop for camera
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera' || !cameraActive || !videoRef.current) {
      return;
    }

    const hasBarcodeDetector = 'BarcodeDetector' in window;
    if (!hasBarcodeDetector) {
      setCameraError(
        'Native BarcodeDetector is not enabled in this browser. Please use the Manual Entry tab or connect a USB barcode scanner.'
      );
      return;
    }

    let isScanning = true;
    const detector = new (window as any).BarcodeDetector({
      formats: [
        'qr_code',
        'ean_13',
        'ean_8',
        'code_128',
        'code_39',
        'upc_a',
        'upc_e',
        'data_matrix',
      ],
    });

    const scanFrame = async () => {
      if (!isScanning || !videoRef.current) return;

      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            if (raw) {
              await processBarcode(raw);
            }
          }
        } catch {
          // Frame detection error, ignore and continue
        }
      }

      if (isScanning) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(scanFrame);

    return () => {
      isScanning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraActive, isOpen, activeTab, processBarcode]);

  // Lifecycle when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setLastScannedProduct(null);
      if (activeTab === 'camera') {
        startCamera();
      } else {
        setTimeout(() => manualInputRef.current?.focus(), 100);
      }
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, startCamera, stopCamera]);

  // Hardware USB Scanner Keyboard Listener inside modal
  useEffect(() => {
    if (!isOpen) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is manually typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target !== manualInputRef.current) {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && diff < 80) {
          // Fast USB barcode scan detected!
          e.preventDefault();
          processBarcode(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        if (diff > 80) {
          buffer = e.key; // Reset buffer if key was typed slowly by human
        } else {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, processBarcode]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-white p-0 overflow-hidden border border-[#E3E1DA]">
        <DialogHeader className="p-4 bg-[#173D32] text-white flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BarcodeIcon className="w-5 h-5 text-emerald-300" />
            <DialogTitle className="text-base text-white font-bold">
              Barcode &amp; QR Scanner
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1 rounded hover:bg-white/10 text-emerald-200 transition-colors"
              title={soundEnabled ? 'Mute beep' : 'Enable beep'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-white/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        {/* Tab switchers */}
        <div className="flex border-b border-[#E3E1DA] bg-[#F8F8F5] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2.5 px-4 font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'camera'
                ? 'border-[#173D32] text-[#173D32] bg-white'
                : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Camera Scanning
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2.5 px-4 font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-[#173D32] text-[#173D32] bg-white'
                : 'border-transparent text-[#5E6B63] hover:text-[#202521]'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" /> Manual / USB Scanner
          </button>
        </div>

        <div className="p-4 space-y-4">
          {activeTab === 'camera' ? (
            <div className="space-y-3">
              {/* Camera Video Viewport */}
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-[#E3E1DA]">
                {cameraActive && (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Laser scan animation & reticle */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-40 border-2 border-emerald-400/80 rounded-lg relative overflow-hidden shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-bounce" />
                      <div className="absolute top-1 left-2 text-[10px] font-mono text-emerald-300 bg-black/60 px-1 rounded">
                        Aim at Barcode / QR
                      </div>
                    </div>
                  </div>
                )}

                {/* Camera error / placeholder */}
                {cameraError && (
                  <div className="absolute inset-0 bg-[#F1F1EC] p-4 flex flex-col items-center justify-center text-center text-xs text-[#5E6B63] space-y-2">
                    <CameraOff className="w-8 h-8 text-amber-600" />
                    <p className="font-semibold text-[#202521] max-w-xs">{cameraError}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startCamera()}
                      className="gap-1 mt-1 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                    </Button>
                  </div>
                )}
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-between text-xs text-[#5E6B63]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Scanner ready • Hardware USB scanners also active</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                  }}
                  className="text-xs text-[#173D32] hover:underline font-semibold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Flip Camera
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                <BarcodeIcon className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">USB Scanner &amp; Keyboard Wedge Mode</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Connect any standard USB handheld scanner. Scans will be immediately detected
                    and added to your active ticket.
                  </p>
                </div>
              </div>

              {/* Manual input form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  processBarcode(manualCode);
                }}
                className="space-y-2"
              >
                <label className="block text-xs font-semibold uppercase text-[#202521]">
                  Enter Barcode or SKU
                </label>
                <div className="flex gap-2">
                  <Input
                    ref={manualInputRef}
                    autoFocus
                    placeholder="e.g. 8901234567890 or SKU code"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="font-mono text-sm h-10"
                  />
                  <Button
                    type="submit"
                    disabled={!manualCode.trim() || isProcessing}
                    isLoading={isProcessing}
                    className="bg-[#173D32] text-white shrink-0"
                  >
                    Look Up &amp; Add
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Quick manual entry bar when on camera tab */}
          {activeTab === 'camera' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                processBarcode(manualCode);
              }}
              className="pt-2 border-t border-[#E3E1DA] flex gap-2"
            >
              <Input
                placeholder="Or type barcode manually..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="text-xs font-mono h-9"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!manualCode.trim() || isProcessing}
                isLoading={isProcessing}
                variant="outline"
                className="shrink-0 text-xs"
              >
                Add
              </Button>
            </form>
          )}

          {/* Last Scanned Item Banner */}
          {lastScannedProduct && (
            <div className="p-3 bg-[#E6F2EA] border border-[#173D32]/20 rounded-lg flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#2F7D4F] shrink-0" />
                <div>
                  <div className="font-bold text-[#173D32]">
                    {lastScannedProduct.product.name}
                  </div>
                  <div className="text-[11px] text-[#5E6B63]">
                    SKU: {lastScannedProduct.product.sku} • {formatCurrency(lastScannedProduct.product.price)} • In Stock: {lastScannedProduct.stock} units
                  </div>
                </div>
              </div>
              <span className="font-bold text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded">
                +1 Added
              </span>
            </div>
          )}
        </div>

        <div className="p-3 bg-[#F8F8F5] border-t border-[#E3E1DA] flex justify-between items-center text-xs">
          <span className="text-[#5E6B63]">
            Keep scanner active to add multiple items in sequence.
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done Scanning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScannerModal;
