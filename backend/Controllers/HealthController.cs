using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Data;

namespace NailsByLeah.Api.Controllers;

/// <summary>Public, so answers say only "ok" or "unavailable": never the database address or error details.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/[controller]")]
public class HealthController(AppDbContext db, TimeProvider time, ILogger<HealthController> logger) : ControllerBase
{
    private static readonly TimeSpan DatabaseTimeout = TimeSpan.FromSeconds(5);

    /// <summary>Is the app running? For the host's restart decisions, so a brief database problem doesn't restart a healthy app.</summary>
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", time = time.GetUtcNow() });

    /// <summary>Can the app read its database? For the keep-awake ping, which also keeps a free database from pausing.</summary>
    [HttpGet("database")]
    public async Task<IActionResult> Database(CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(DatabaseTimeout);
        try
        {
            await db.SalonSettings.AsNoTracking().AnyAsync(timeout.Token); // a real query: also proves the tables exist
            return Ok(new { status = "ok" });
        }
        // A timeout is an OperationCanceledException too; only the caller giving up may pass through.
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Health check could not read the database");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "unavailable" });
        }
    }
}
