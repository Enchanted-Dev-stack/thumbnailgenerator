import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { writeFile } from 'fs/promises';
import path from 'path';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function streamToText(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }

  return result;
}

async function saveBase64Image(base64Data: string, fileName: string): Promise<string> {
  // Remove data URL prefix if present
  const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Image, 'base64');
  
  // Save to public directory
  const publicDir = path.join(process.cwd(), 'public', 'temp');
  const filePath = path.join(publicDir, fileName);
  
  try {
    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Write the file
    await writeFile(filePath, imageBuffer);
    
    // Return the public URL path
    return `/temp/${fileName}`;
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
}

// Valid sizes for the model
const VALID_SIZES = [64, 128, 192, 256, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024];

// Find the nearest valid size while maintaining aspect ratio
function getNearestValidSize(width: number, height: number): { width: number; height: number } {
  // Find nearest valid width
  const nearestWidth = VALID_SIZES.reduce((prev, curr) => {
    return Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev;
  });

  // Calculate height to maintain aspect ratio
  const aspectRatio = height / width;
  const scaledHeight = Math.round(nearestWidth * aspectRatio);
  
  // Make sure height is also valid, if not, work backwards from height
  const nearestHeight = VALID_SIZES.reduce((prev, curr) => {
    return Math.abs(curr - scaledHeight) < Math.abs(prev - scaledHeight) ? curr : prev;
  });

  // If height-based calculation gives a better fit, use that
  const heightBasedWidth = Math.round(nearestHeight / aspectRatio);
  const nearestWidthFromHeight = VALID_SIZES.reduce((prev, curr) => {
    return Math.abs(curr - heightBasedWidth) < Math.abs(prev - heightBasedWidth) ? curr : prev;
  });

  // Compare which approach maintains aspect ratio better
  const widthFirstError = Math.abs(scaledHeight / nearestWidth - aspectRatio);
  const heightFirstError = Math.abs(nearestHeight / nearestWidthFromHeight - aspectRatio);

  return widthFirstError < heightFirstError
    ? { width: nearestWidth, height: nearestHeight }
    : { width: nearestWidthFromHeight, height: nearestHeight };
}

export async function POST(req: Request) {
  try {
    const { prompt, image, mask } = await req.json();

    if (!prompt || !image || !mask) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields (prompt, image, mask)' }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    console.log('Processing request:', {
      prompt
    });

    const prediction = await replicate.predictions.create({
      version: "e490d072a34a94a11e9711ed5a6ba621c3fab884eda1665d9d3a282d65a21180",
      input: {
        prompt: `${prompt}, highly detailed, perfect quality, 4k`,
        image: image,
        mask: mask,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        negative_prompt: "blurry, low quality, distorted, ugly, bad anatomy, bad proportions, watermark",
      },
    });

    console.log('Prediction started:', prediction.id);

    let resultImageUrl = null;
    let attempts = 0;
    const maxAttempts = 60;
    const delay = 1000;

    while (attempts < maxAttempts) {
      const result = await replicate.predictions.get(prediction.id);
      console.log('Poll attempt', attempts + 1, 'status:', result.status);
      
      if (result.error) {
        console.error('Replicate error:', result.error);
        throw new Error(`Replicate error: ${result.error}`);
      }

      if (result.status === 'succeeded') {
        resultImageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
        break;
      }

      if (result.status === 'failed') {
        throw new Error('Image generation failed');
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }

    if (!resultImageUrl) {
      throw new Error('Timeout waiting for image generation');
    }

    return new Response(
      JSON.stringify({ imageUrl: resultImageUrl }),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('API error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to process image',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
