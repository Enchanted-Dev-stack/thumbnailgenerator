import { useState, useRef } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface ImageEditorProps {
  imageUrl: string;
  onEdit: (editedImageUrl: string) => void;
}

export function ImageEditor({ imageUrl, onEdit }: ImageEditorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
    setSelection(null);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw selection rectangle
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;

    const width = x - startPos.x;
    const height = y - startPos.y;

    ctx.fillRect(startPos.x, startPos.y, width, height);
    ctx.strokeRect(startPos.x, startPos.y, width, height);

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

  const createMask = () => {
    if (!selection || !canvasRef.current) return null;

    const canvas = document.createElement('canvas');
    canvas.width = canvasRef.current.width;
    canvas.height = canvasRef.current.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Create a black background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw white rectangle for the selected area
    ctx.fillStyle = 'white';
    ctx.fillRect(selection.x, selection.y, selection.width, selection.height);

    return canvas.toDataURL('image/png');
  };

  const handleEdit = async () => {
    if (!selection || !prompt) return;

    setLoading(true);
    setError(null);

    try {
      const mask = createMask();
      if (!mask) throw new Error('Failed to create mask');

      const response = await fetch("/api/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image: imageUrl,
          mask,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to edit image");
      }

      onEdit(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <img
          src={imageUrl}
          alt="Original thumbnail"
          className="w-full rounded-lg"
          style={{ display: "none" }}
          onLoad={(e) => {
            if (!canvasRef.current) return;
            const img = e.target as HTMLImageElement;
            canvasRef.current.width = img.naturalWidth;
            canvasRef.current.height = img.naturalHeight;
          }}
        />
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
        <Button
          onClick={handleEdit}
          disabled={loading || !selection || !prompt}
          className="w-full"
        >
          {loading ? "Editing..." : "Edit Selected Area"}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 text-red-500 rounded-lg text-center">
          {error}
        </div>
      )}
    </div>
  );
}
