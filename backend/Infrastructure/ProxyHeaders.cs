using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>
/// Behind the host's proxy every request seems to come from the proxy, over plain HTTP. This reads the visitor's real
/// address and the original https from the X-Forwarded-For and X-Forwarded-Proto headers, so rate limits, the activity
/// log and the HTTPS redirect see the truth. Off by default: without a proxy in front, anyone could fake these headers.
///
/// Proxies add to the right of X-Forwarded-For and a visitor can send anything on the left, so only the rightmost
/// <see cref="ProxyOptions.ForwardLimit"/> entries are believed. Faked entries further left are ignored.
/// </summary>
public static class ProxyHeaders
{
    public static IServiceCollection AddProxyHeaders(this IServiceCollection services)
    {
        services.AddOptions<ForwardedHeadersOptions>().Configure<IOptions<ProxyOptions>>((options, proxy) =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = proxy.Value.ForwardLimit;
            // The host's proxies have no fixed addresses to list, and visitors can only reach the app through them.
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            options.RequireHeaderSymmetry = false; // X-Forwarded-Proto has fewer entries than X-Forwarded-For
        });
        return services;
    }

    public static IApplicationBuilder UseProxyHeaders(this IApplicationBuilder app) =>
        app.ApplicationServices.GetRequiredService<IOptions<ProxyOptions>>().Value.Enabled ? app.UseForwardedHeaders() : app;
}
