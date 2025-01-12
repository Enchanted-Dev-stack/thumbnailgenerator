import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import connectDB from '@/lib/mongodb';
import { Thumbnail } from '@/lib/models/thumbnail';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log('Making request to Replicate with prompt:', prompt);
    const prediction = await replicate.predictions.create({
      model: "black-forest-labs/flux-schnell",
      input: {
        prompt: `YouTube Thumbnail: ${prompt}`,
        go_fast: true,
        megapixels: "1",
        num_outputs: 1,
        aspect_ratio: "16:9",
        output_format: "webp",
        output_quality: 80,
        num_inference_steps: 4
      }
    });

    // Wait for the prediction to complete
    let output = await replicate.wait(prediction);
    console.log('Raw Replicate response:', output);

    // Handle the output based on its type
    let imageUrl: string;
    if (output && output.output && output.output[0]) {
      if (output.output[0] instanceof ReadableStream) {
        imageUrl = await streamToString(output.output[0]);
      } else {
        imageUrl = output.output[0];
      }
    } else {
      throw new Error('Invalid response format from image generation service');
    }

    console.log('Final image URL:', imageUrl);

    await connectDB();
    
    const thumbnail = await Thumbnail.create({
      prompt,
      imageUrl,
    });

    return NextResponse.json({ imageUrl, id: thumbnail._id });
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate thumbnail' },
      { status: 500 }
    );
  }
}
