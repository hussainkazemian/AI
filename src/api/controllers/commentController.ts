import { Request, Response, NextFunction } from 'express';
import CustomError from '../../classes/CustomError';
import { ChatCompletion } from 'openai/resources/chat/completions';
import fetchData from './../../lib/fetchData';

/**
 * POST handler for /api/v1/comments
 *
 * Accepts body:
 * {
 *   text: string,
 *   style?: string,
 *   responder?: { name?: string, persona?: string },
 *   temperature?: number,
 *   max_tokens?: number,
 *   model?: string
 * }
 *
 * Returns:
 * { response: string, raw?: any }
 *
 * Note: This file updates how we extract the reply from the completion result
 * to avoid TypeScript errors when the Choice type doesn't contain a `text` property.
 */
const commentPost = async (
  req: Request<{}, {}, { text: string; style?: string; responder?: { name?: string; persona?: string }; temperature?: number; max_tokens?: number; model?: string }>,
  res: Response<{ response: string; raw?: any }>,
  next: NextFunction
) => {
  try {
    const {
      text,
      style = 'nice',
      responder = { name: 'Responder', persona: 'helpful and friendly' },
      temperature = 0.7,
      max_tokens = 150,
      model = 'gpt-4o-mini',
    } = req.body || {};

    if (!text || typeof text !== 'string') {
      next(new CustomError('No text provided', 400));
      return;
    }

    if (!process.env.OPENAI_API_URL) {
      next(new CustomError('No API url found', 500));
      return;
    }

    // Build system and user messages
    const systemParts: string[] = [];
    if (responder.name) systemParts.push(`You are ${responder.name}.`);
    if (responder.persona) systemParts.push(`${responder.persona}.`);
    else systemParts.push('You are a helpful assistant.');
    systemParts.push(`Adopt this tone: ${style}.`);
    systemParts.push('Keep replies concise (1-2 short sentences), suitable for a YouTube comment. Do not include meta commentary about being an AI.');
    const systemMessage = systemParts.join(' ');

    const userMessage = `A user commented: "${text}". Write a short reply (1-2 sentences) in the requested tone (${style}).`;

    const requestPayload = {
      model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens,
    };

    // Build headers; include Authorization only if OPENAI_API_KEY is set.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.OPENAI_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
    }

    const url = process.env.OPENAI_API_URL.replace(/\/$/, '') + '/v1/chat/completions';

    const completion = await fetchData<ChatCompletion>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
    });

    if (!completion?.choices?.length) {
      next(new CustomError('No completion choices returned', 500));
      return;
    }

    // TypeScript error happened because Choice type (from openai types) may not have `text`.
    // To be safe and avoid TS2339, cast the choice to any when trying alternate properties.
    // Prefer the structured chat response (choice.message.content). If unavailable, try other fields on the raw response.
    const choiceAny = completion.choices[0] as any;
    const reply =
      choiceAny?.message?.content ??
      // Some endpoints/clients return text directly on the choice (legacy / different shapes)
      (typeof choiceAny?.text === 'string' ? choiceAny.text : '') ??
      '';

    res.json({
      response: reply,
      raw: completion,
    });
  } catch (error) {
    next(error);
  }
};

export { commentPost };