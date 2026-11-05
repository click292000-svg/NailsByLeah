using NailsByLeah.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddNailsByLeah(builder.Configuration);

var app = builder.Build();
await app.RunStartupTasksAsync();

app.UseExceptionHandler();
if (!app.Environment.IsDevelopment())
    app.UseHsts();

// HTTPS only (Ref 8.5).
app.UseHttpsRedirection();
app.UseSecurityHeaders();
// The website's own files: public, and before the rate limits, because one page view loads several.
app.UseStaticFiles();
// After the files: if a route were chosen first, the "missing file" route would stop real files being served.
app.UseRouting();

app.UseAuthentication();
// After authentication, so a signed-in client's limits follow their account rather than their network.
app.UseNailsByLeahRateLimiting();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
    app.MapOpenApi().AllowAnonymous();

app.MapControllers();
app.MapWebsite();

await app.RunAsync();

/// <summary>Entry point; public so the integration tests can host the API.</summary>
public partial class Program;
