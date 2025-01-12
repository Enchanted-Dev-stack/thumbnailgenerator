import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  imageUrl: string;
  onEdit: (newImageUrl: string) => void;
  onCancel: () => void;
}

export function ThumbnailEditor({ imageUrl, onEdit, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load and draw image without selection overlay
  const loadAndDrawImage = (url: string) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = url;
  };

  // Load and draw image
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.dataset.originalWidth = img.naturalWidth.toString();
      canvas.dataset.originalHeight = img.naturalHeight.toString();
      
      loadAndDrawImage(imageUrl);
    };

    img.src = imageUrl;
  }, [imageUrl]);

  // Draw selection overlay only while selecting
  useEffect(() => {
    if (!canvasRef.current || !selection || loading) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw original image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // Only draw selection if we're not loading
      if (!loading) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
      }
    };
    img.src = imageUrl;
  }, [selection, imageUrl, loading]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    setStartPoint(point);
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !startPoint) return;

    const currentPoint = getCanvasPoint(e);
    
    setSelection({
      x: Math.min(startPoint.x, currentPoint.x),
      y: Math.min(startPoint.y, currentPoint.y),
      width: Math.abs(currentPoint.x - startPoint.x),
      height: Math.abs(currentPoint.y - startPoint.y)
    });
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setStartPoint(null);
  };

  const handleEdit = async () => {
    if (!selection || !prompt || !canvasRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      // Create mask canvas at original dimensions
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error('Failed to get mask context');

      // Fill with black (areas to preserve)
      maskCtx.fillStyle = '#000000';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      // Fill selection with white (areas to edit)
      maskCtx.fillStyle = '#FFFFFF';
      maskCtx.fillRect(
        selection.x,
        selection.y,
        selection.width,
        selection.height
      );

      const imageData = canvas.toDataURL('image/png');
      const maskData = maskCanvas.toDataURL('image/png');

      // Save mask preview
      await fetch('/api/saveMask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maskData,
          timestamp: Date.now(),
          debug: {
            canvasDimensions: { width: canvas.width, height: canvas.height },
            selection: { ...selection },
          }
        }),
      });

      // Send edit request
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image: imageData,
          mask: maskData,
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

      // Clear selection before calling onEdit
      setSelection(null);
      
      // Call onEdit with the new image URL
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full rounded-lg"
          style={{
            cursor: isSelecting ? 'crosshair' : 'default'
          }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-white">Processing...</div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to add or change in the selected area..."
          disabled={loading}
        />

        {error && (
          <div className="p-4 bg-red-500/10 text-red-500 rounded-lg text-center">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleEdit}
            disabled={!selection || !prompt || loading}
            className="flex-1"
          >
            {loading ? 'Applying Changes...' : 'Apply Changes'}
          </Button>
          <Button
            onClick={() => {
              setSelection(null);
              onCancel();
            }}
            variant="outline"
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
