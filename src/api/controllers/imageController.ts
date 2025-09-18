/* Controller for generating, saving, and thumbnailing images using OpenAI Images API.
   - Lazy-initializes the OpenAI SDK client (so server won't crash when OPENAI_API_KEY is absent)
   - Falls back to calling process.env.OPENAI_API_URL + '/v1/images/generations' via fetchData when no API key is provided
   - Handles responses that return either a remote URL (data[0].url) or base64 data (data[0].b64_json)
   - Saves image to ./uploads and creates a thumbnail with sharp (sharp must be installed)
*/

import { Request, Response, NextFunction } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
import CustomError from '../../classes/CustomError';
import fetchData from './../../lib/fetchData';

type ReqBody = {
  topic: string;
  splashText?: string;
  style?: string;
  size?: '256x256' | '512x512' | '1024x1024';
  model?: string;
};

const makePrompt = (topic: string, splashText = '', style = '') => {
  const promptParts: string[] = [];
  promptParts.push(`YouTube thumbnail for a video about ${topic}.`);
  if (style) promptParts.push(style + '.');
  if (splashText) promptParts.push(`Include large bold splash text: "${splashText}".`);
  promptParts.push('High contrast, bold composition, clear central subject, readable text, vibrant colors.');
  promptParts.push('Composition suited for a 16:9 YouTube thumbnail.');
  return promptParts.join(' ');
};

const generateImage = async (
  req: Request<{}, {}, ReqBody>,
  res: Response<{}, { url?: string; b64?: string }>,
  next: NextFunction
) => {
  try {
    const { topic, splashText = '', style = '', size = '1024x1024', model = 'dall-e-2' } =
      req.body || {};

    if (!topic || typeof topic !== 'string') {
      next(new CustomError('topic (string) is required in request body', 400));
      return;
    }

    const prompt = makePrompt(topic, splashText, style);

    // If an API key is present, use the official SDK (lazy init)
    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.images.generate({
        model,
        prompt,
        size,
      });

      // Response can include either a url or b64_json
      const item = response?.data?.[0];
      if (!item) {
        next(new CustomError('Image not generated (SDK returned no data)', 500));
        return;
      }

      if (item.url) {
        res.locals.url = item.url;
      } else if (item.b64_json) {
        res.locals.b64 = item.b64_json;
      } else {
        next(new CustomError('Image not generated (no url or b64_json)', 500));
        return;
      }

      next();
      return;
    }

    // Otherwise, attempt to call a custom OpenAI-compatible endpoint via OPENAI_API_URL
    if (process.env.OPENAI_API_URL) {
      const baseUrl = process.env.OPENAI_API_URL.replace(/\/$/, '');
      const url = `${baseUrl}/v1/images/generations`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // include Authorization if key exists in env (some proxies still need it)
      if (process.env.OPENAI_API_KEY) headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;

      const payload = { model, prompt, size };

      const apiResponse = await fetchData<any>(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const item = apiResponse?.data?.[0];
      if (!item) {
        next(new CustomError('Image not generated (proxy returned no data)', 500));
        return;
      }
      if (item.url) {
        res.locals.url = item.url;
      } else if (item.b64_json) {
        res.locals.b64 = item.b64_json;
      } else {
        next(new CustomError('Image not generated (proxy returned no url or b64_json)', 500));
        return;
      }
      next();
      return;
    }

    // If neither API key nor proxy URL is present, return informative error.
    next(new CustomError('No OPENAI_API_KEY or OPENAI_API_URL configured', 500));
  } catch (error) {
    next(error);
  }
};

const saveImage = async (
  req: Request<{}, {}, ReqBody>,
  res: Response<{}, { file?: string; url?: string; b64?: string }>,
  next: NextFunction
) => {
  try {
    // Ensure uploads directory exists
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const baseName = (req.body?.topic || 'image').replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
    const timestamp = Date.now();
    const imageName = `${baseName}_${timestamp}.png`;
    const imagePath = path.join(uploadsDir, imageName);

    // If the image was returned as base64, write it directly
    if (res.locals.b64) {
      const b64 = String(res.locals.b64);
      const buffer = Buffer.from(b64, 'base64');
      fs.writeFileSync(imagePath, buffer);
      res.locals.file = imageName;
      next();
      return;
    }

    // Otherwise, expect a remote URL to download
    if (!res.locals.url) {
      next(new CustomError('No image URL or data to save', 500));
      return;
    }

    const imageUrl = String(res.locals.url);

    await new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(imagePath);
      https
        .get(imageUrl, (response) => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Failed to download image, status ${response.statusCode}`));
            return;
          }
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        })
        .on('error', (err) => {
          try {
            fs.unlinkSync(imagePath);
          } catch (_) {
            // ignore
          }
          reject(err);
        });
    });

    res.locals.file = imageName;
    next();
  } catch (error) {
    next(error);
  }
};

const makeThumbnail = async (
  _req: Request,
  res: Response<{}, { file?: string; url?: string; thumb?: string }>,
  next: NextFunction
) => {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const fileName = res.locals.file;
    if (!fileName) {
      next();
      return;
    }
    const filePath = path.join(uploadsDir, fileName);
    const thumbName = `thumb_${fileName}`;
    const thumbPath = path.join(uploadsDir, thumbName);

    // Require sharp to be installed; if not installed, skip thumbnail creation.
    if (!sharp) {
      console.warn('sharp not installed, skipping thumbnail creation');
      next();
      return;
    }

    await sharp(filePath).resize(320, 180).png().toFile(thumbPath);

    res.locals.thumb = thumbName;
    next();
  } catch (error) {
    console.error('Thumbnail creation failed:', error);
    next();
  }
};

const respondWithImage = async (
  _req: Request,
  res: Response<{ file?: string; thumb?: string; url?: string }>
) => {
  res.json({
    file: res.locals.file,
    thumb: res.locals.thumb,
    url: res.locals.url,
  });
};

export { generateImage, saveImage, makeThumbnail, respondWithImage };