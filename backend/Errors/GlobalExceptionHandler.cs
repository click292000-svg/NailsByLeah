using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace NailsByLeah.Api.Errors;

/// <summary>Turns every unhandled exception into a ProblemDetails response and logs it (Ref 14.4).</summary>
public sealed class GlobalExceptionHandler(IProblemDetailsService problemDetails, ILogger<GlobalExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = exception switch
        {
            AppException app => FromAppException(app),
            DbUpdateConcurrencyException => new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Conflict",
                Detail = "This record was changed by someone else. Please reload and try again.",
                Extensions = { ["code"] = "concurrency_conflict" },
            },
            _ => new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Unexpected error",
                Detail = "Something went wrong on our side. Please try again later.",
            },
        };

        if (problem.Status >= 500)
            logger.LogCritical(exception, "Unhandled exception for {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
        else
            logger.LogInformation("Request {Method} {Path} failed with {Status}: {Detail}",
                httpContext.Request.Method, httpContext.Request.Path, problem.Status, problem.Detail);

        httpContext.Response.StatusCode = problem.Status!.Value;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    private static ProblemDetails FromAppException(AppException ex)
    {
        ProblemDetails problem = ex.Errors is { Count: > 0 } errors
            ? new ValidationProblemDetails(errors)
            : new ProblemDetails();

        problem.Status = ex.StatusCode;
        problem.Title = ex.Title;
        problem.Detail = ex.Message;
        if (ex.Code is not null)
            problem.Extensions["code"] = ex.Code;
        if (ex is AccountLockedException locked)
            problem.Extensions["lockoutEndUtc"] = locked.LockoutEndUtc;
        return problem;
    }
}
