/**
 * An error whose message is safe to show to the person using the app.
 * `code` is stable and machine-readable; the frontend branches on it.
 */
export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export const badRequest = (message, fields) => new HttpError(400, 'bad_request', message, fields)
export const invalid = (message, fields) => new HttpError(422, 'invalid', message, fields)
export const unauthenticated = (message = 'Sign in to continue.') => new HttpError(401, 'unauthenticated', message)
export const forbidden = (message = 'Your role does not allow this.') => new HttpError(403, 'forbidden', message)
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message)
export const conflict = (code, message, fields) => new HttpError(409, code, message, fields)
export const planRequired = (message) => new HttpError(402, 'plan_required', message)
