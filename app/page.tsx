"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThumbnailEditor } from "@/components/ThumbnailEditor";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateThumbnail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate thumbnail");
      }

      setGeneratedImage(data.imageUrl);
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleEditedImage = (editedImageUrl: string) => {
    setGeneratedImage(editedImageUrl);
    setIsEditing(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">YouTubers</h1>
        <div className="text-center mb-8">
          <span className="mr-2">Powered by Flux AI</span>
          <span className="px-2 py-1 bg-green-500 text-white rounded-full text-xs">Fast Generation</span>
        </div>

        <div className="space-y-8">
          {!isEditing && (
            <form onSubmit={generateThumbnail} className="space-y-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your YouTube thumbnail..."
                className="w-full h-32 p-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button 
                type="submit" 
                className="w-full"
                disabled={loading || !prompt}
              >
                {loading ? "Generating..." : "Generate Thumbnail"}
              </Button>
            </form>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 text-red-500 rounded-lg text-center">
              {error}
            </div>
          )}

          {generatedImage && (
            <div className="space-y-4">
              {isEditing ? (
                <ThumbnailEditor
                  imageUrl={generatedImage}
                  onEdit={handleEditedImage}
                  onCancel={() => setIsEditing(false)}
                />
              ) : (
                <>
                  <img
                    src={generatedImage}
                    alt="Generated thumbnail"
                    className="w-full rounded-lg"
                  />
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setIsEditing(true)}
                      className="flex-1"
                    >
                      Edit Thumbnail
                    </Button>
                    <Button 
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedImage;
                        link.download = 'thumbnail.png';
                        link.click();
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      Download
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
