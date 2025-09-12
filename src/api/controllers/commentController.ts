import { Request, Response, NextFunction } from 'express';
import CustomError from '../../classes/CustomError';
import { ChatCompletion } from 'openai/resources/chat/completions';
import fetchData from './../../lib/fetchData';

const commentPost = async (
  req: Request<{}, {}, { text: string }>,
  res: Response<{ response: string }>,
  next: NextFunction
) => {
  try {
    const request = {
      messages: [
        {
          role: 'system',
          content: 'You are the user that we are looking for doing tasks',
        },
        {
          role: 'user',
          content: req.body.text,
        },
      ],
      model: 'gpt-4o-mini',
    };

    if (!process.env.OPENAI_API_URL) {
      next(new CustomError('No API url found', 500));
      return;
    }

    const completion = await fetchData<ChatCompletion>(
      process.env.OPENAI_API_URL + '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );

    if (!completion?.choices?.length) {
      next(new CustomError('No completion choices returned', 500));
      return;
    }

    res.json({
      response: completion.choices[0].message?.content ?? '',
    });
  } catch (error) {
    next(error);
  }
};

export { commentPost };
