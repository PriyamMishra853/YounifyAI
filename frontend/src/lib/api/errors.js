/** Error thrown by both API implementations. `code` is stable; `message` is user-facing. */
export class ApiError extends Error {
  constructor(message, { status = 400, code = 'bad_request', fields } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}
