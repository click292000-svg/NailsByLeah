using Microsoft.Net.Http.Headers;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>
/// Serves the built React website (frontend/dist, copied to wwwroot) from the API, so the site and the API share one
/// address and the SameSite=Strict login cookie works without CORS. In development wwwroot is normally empty and the
/// Vite dev server serves the website instead.
/// </summary>
public static class WebsiteHosting
{
    /// <summary>Pages may load only this site's own files, plus photo previews (blob:), the CSS cursor (data:) and the Google map.</summary>
    public const string WebsiteContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; " +
        "frame-src https://maps.google.com https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    /// <summary>API answers are data, never pages, so they may load nothing at all.</summary>
    public const string ApiContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";

    private static readonly PathString ApiPrefix = new("/api");

    public static bool IsApiRequest(HttpContext context) => context.Request.Path.StartsWithSegments(ApiPrefix);

    public static IServiceCollection AddWebsiteHosting(this IServiceCollection services) =>
        services.Configure<StaticFileOptions>(options => options.OnPrepareResponse = context =>
        {
            // Vite puts a content hash in these file names, so they can be kept for a year; a new build gets new names.
            // index.html is what points at them, so browsers must always ask for the latest one.
            var headers = context.Context.Response.Headers;
            headers[HeaderNames.CacheControl] = context.Context.Request.Path.StartsWithSegments("/assets")
                ? "public, max-age=31536000, immutable"
                : context.File.Name == "index.html" ? "no-cache" : "public, max-age=3600";
        });

    public static void MapWebsite(this WebApplication app)
    {
        // Without these, an unknown address would fall to the sign-in-required default and answer 401.
        app.MapFallback("/api/{**rest}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found")).AllowAnonymous();
        app.MapFallback("{*path:file}", () => Results.NotFound()).AllowAnonymous();

        // Everything else is a page of the website (/book, /admin/bookings…); React Router shows the right one.
        app.MapFallbackToFile("index.html").AllowAnonymous();
    }
}
