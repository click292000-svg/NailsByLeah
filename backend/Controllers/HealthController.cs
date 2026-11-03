using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace NailsByLeah.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/[controller]")]
public class HealthController(TimeProvider time) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", time = time.GetUtcNow() });
}
