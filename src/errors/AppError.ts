export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;
  public readonly details?: unknown;

  constructor(opts: {
    statusCode: number;
    code: string;
    message: string;
    expose?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'AppError';
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.expose = opts.expose ?? true;
    this.details = opts.details;
    // Restore prototype chain so instanceof checks work after TypeScript transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown) {
    super({ statusCode: 400, code: 'BAD_REQUEST', message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super({ statusCode: 401, code: 'UNAUTHORIZED', message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super({ statusCode: 404, code: 'NOT_FOUND', message });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super({ statusCode: 409, code: 'CONFLICT', message, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super({ statusCode: 403, code: 'FORBIDDEN', message });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload Too Large') {
    super({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message });
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal Server Error') {
    super({ statusCode: 500, code: 'INTERNAL_ERROR', message, expose: false });
  }
}
