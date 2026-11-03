namespace NailsByLeah.Api.Errors;

/// <summary>
/// Expected business errors. The global exception handler turns these into ProblemDetails responses.
/// <see cref="Code"/> is a stable machine-readable value the frontend can switch on.
/// </summary>
public class AppException(int statusCode, string title, string detail, string? code = null) : Exception(detail)
{
    public int StatusCode { get; } = statusCode;
    public string Title { get; } = title;
    public string? Code { get; } = code;
    public IDictionary<string, string[]>? Errors { get; init; }
}

public sealed class ValidationAppException : AppException
{
    public ValidationAppException(string field, string message, string? code = null)
        : base(StatusCodes.Status400BadRequest, "Validation failed", message, code)
    {
        Errors = new Dictionary<string, string[]> { [field] = [message] };
    }

    public ValidationAppException(IDictionary<string, string[]> errors)
        : base(StatusCodes.Status400BadRequest, "Validation failed", "One or more fields are invalid.")
    {
        Errors = errors;
    }
}

public sealed class NotFoundException(string detail)
    : AppException(StatusCodes.Status404NotFound, "Not found", detail, "not_found");

public sealed class ConflictException(string detail, string? code = null)
    : AppException(StatusCodes.Status409Conflict, "Conflict", detail, code);

public sealed class ForbiddenException(string detail, string? code = null)
    : AppException(StatusCodes.Status403Forbidden, "Forbidden", detail, code);

public sealed class UnauthorizedAppException(string detail, string? code = null)
    : AppException(StatusCodes.Status401Unauthorized, "Unauthorized", detail, code);

public sealed class AccountLockedException(DateTime lockoutEndUtc)
    : AppException(StatusCodes.Status423Locked, "Account locked",
        "Your account is locked because of too many failed login attempts. Please try again in 15 minutes.",
        "account_locked")
{
    public DateTime LockoutEndUtc { get; } = lockoutEndUtc;
}

public sealed class PaymentFailedException(string detail)
    : AppException(StatusCodes.Status402PaymentRequired, "Payment failed", detail, "payment_failed");

/// <summary>Raised by the data layer when a UNIQUE index rejects a write.</summary>
public sealed class UniqueConstraintViolationException(string? indexName, Exception inner)
    : Exception($"Unique constraint violated: {indexName}", inner)
{
    public string? IndexName { get; } = indexName;
}
