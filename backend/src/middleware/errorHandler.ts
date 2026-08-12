import { type Request, type Response, type NextFunction } from "express"
import { logger } from "../lib/logger.js"

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(400, message) }
}

export class AuthError extends AppError {
  constructor(message: string) { super(403, message) }
}

export class NotFoundError extends AppError {
  constructor(message: string) { super(404, message) }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message })
    return
  }
  logger.error({ err, path: req.path }, "Unhandled error")
  res.status(500).json({ error: "Something went wrong. Please try again." })
}
