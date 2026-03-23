export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "AuthenticationError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class IntegrationError extends AppError {
  constructor(provider: string, message: string) {
    super(`${provider}: ${message}`, "INTEGRATION_ERROR", 502);
    this.name = "IntegrationError";
  }
}

/**
 * Formats an error into a consistent JSON response shape.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }

  console.error("Unhandled error:", error);
  return Response.json(
    { error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
