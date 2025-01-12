import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface ThumbnailEditorProps {
  imageUrl: string;
  onEdit: (editedImageUrl: string) => void;
  onCancel: () => void;
}

export function ThumbnailEditor({ imageUrl, onEdit, onCancel }: ThumbnailEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      
      // Store original dimensions for later use
      canvas.dataset.originalWidth = img.naturalWidth.toString();
      canvas.dataset.originalHeight = img.naturalHeight.toString();
      
      // Set canvas display size
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Optionally scale the display size while maintaining aspect ratio
      const maxWidth = 800; // Maximum display width
      if (canvas.width > maxWidth) {
        const scale = maxWidth / canvas.width;
        canvas.style.width = `${maxWidth}px`;
        canvas.style.height = `${canvas.height * scale}px`;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setStartPos({ x, y });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Redraw original image
    const img = new Image();
    img.src = imageUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw selection rectangle
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    const width = x - startPos.x;
    const height = y - startPos.y;
    
    ctx.strokeRect(startPos.x, startPos.y, width, height);

    // Add semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, startPos.y); // Top
    ctx.fillRect(0, y, canvas.width, canvas.height - y); // Bottom
    ctx.fillRect(0, startPos.y, startPos.x, height); // Left
    ctx.fillRect(x, startPos.y, canvas.width - x, height); // Right

    setSelection({
      x: Math.min(startPos.x, x),
      y: Math.min(startPos.y, y),
      width: Math.abs(width),
      height: Math.abs(height)
    });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleEdit = async () => {
    if (!selection || !prompt || !canvasRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const originalWidth = parseInt(canvasRef.current.dataset.originalWidth || '0');
      const originalHeight = parseInt(canvasRef.current.dataset.originalHeight || '0');
      
      if (!originalWidth || !originalHeight) {
        throw new Error('Original image dimensions not found');
      }

      // Create a canvas for the full image
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = originalWidth;
      imageCanvas.height = originalHeight;
      const imageCtx = imageCanvas.getContext('2d');
      if (!imageCtx) throw new Error('Failed to get image context');

      // Create a new image with crossOrigin set
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      // Wait for the image to load before proceeding
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Draw the current image at original dimensions
      imageCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
      const imageData = imageCanvas.toDataURL('image/png');

      // Create mask canvas with same dimensions
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = originalWidth;
      maskCanvas.height = originalHeight;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error('Failed to get mask context');

      // Fill with black (areas to preserve)
      maskCtx.fillStyle = '#000000';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      // Scale selection coordinates if canvas display size differs from original size
      const scaleX = originalWidth / canvasRef.current.offsetWidth;
      const scaleY = originalHeight / canvasRef.current.offsetHeight;

      // Fill selection with white (areas to edit)
      maskCtx.fillStyle = '#FFFFFF';
      maskCtx.fillRect(
        Math.round(selection.x * scaleX),
        Math.round(selection.y * scaleY),
        Math.round(selection.width * scaleX),
        Math.round(selection.height * scaleY)
      );

      const maskData = maskCanvas.toDataURL('image/png');

      console.log('Sending edit request:', {
        dimensions: { width: originalWidth, height: originalHeight },
        selection: {
          x: Math.round(selection.x * scaleX),
          y: Math.round(selection.y * scaleY),
          width: Math.round(selection.width * scaleX),
          height: Math.round(selection.height * scaleY)
        }
      });

      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image: imageData,
          mask: maskData,
          width: originalWidth,
          height: originalHeight,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Failed to edit image: ${response.status}`);
      }

      const data = await response.json();
      if (!data.imageUrl) {
        throw new Error('No image URL received from server');
      }

      onEdit(data.imageUrl);
    } catch (err) {
      console.error('Edit error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
      </div>

      <div className="space-y-2">
        <Input
          placeholder="Describe what you want to add or change in the selected area..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />
        <div className="flex gap-2">
          <Button
            onClick={handleEdit}
            disabled={loading || !selection || !prompt}
            className="flex-1"
          >
            {loading ? "Applying Changes..." : "Apply Changes"}
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 text-red-500 rounded-lg text-center">
          {error}
        </div>
      )}
    </div>
  );
}
