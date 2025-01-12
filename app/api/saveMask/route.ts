import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(req: Request) {
  try {
    const { maskData, timestamp } = await req.json();

    if (!maskData) {
      return new Response(
        JSON.stringify({ error: 'Missing mask data' }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Convert base64 to buffer
    const base64Data = maskData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Save to public folder
    const filename = `mask_preview_${timestamp}.png`;
    const publicPath = join(process.cwd(), 'public');
    const filePath = join(publicPath, filename);

    await writeFile(filePath, buffer);

    return new Response(
      JSON.stringify({ 
        success: true,
        path: `/${filename}`
      }),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Save mask error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to save mask',
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
