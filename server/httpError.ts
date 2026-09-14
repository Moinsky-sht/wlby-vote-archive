export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function unauthorized(message = '账号或密码错误') {
  return new HttpError(401, message, 'INVALID_CREDENTIALS');
}

export function forbidden(message: string) {
  return new HttpError(403, message, 'FORBIDDEN');
}

export function tooManyRequests(message: string, code = 'TOO_MANY_REQUESTS') {
  return new HttpError(429, message, code);
}
