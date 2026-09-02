import type { VercelRequest, VercelResponse } from '@vercel/node';

export function parseBody<T>(req: VercelRequest): T {
  const body = req.body;
  if (body == null || body === '') return {} as T;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as T;
    } catch {
      return {} as T;
    }
  }
  return body as T;
}

export function json(res: VercelResponse, status: number, payload: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}

export function omitUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
