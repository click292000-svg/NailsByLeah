using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>
/// Keeps reference photos in a private Supabase Storage bucket, because hosts wipe their disk on every deploy. Only the
/// API holds the key: browsers never reach the bucket, so they still go through the API's permission checks.
/// </summary>
public sealed class SupabaseReferenceImageStore(HttpClient http, IOptions<SupabaseOptions> options) : IReferenceImageStore
{
    private readonly SupabaseOptions _options = options.Value;

    public async Task<string> SaveAsync(ReadOnlyMemory<byte> content, string extension, CancellationToken ct = default)
    {
        var name = ReferenceImageFileName.New(extension);
        using var request = NewRequest(HttpMethod.Post, name);
        request.Content = new ReadOnlyMemoryContent(content);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(ReferenceImageFileName.ContentTypeFor(extension));

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw await FailureAsync("save", response, ct);
        return name;
    }

    public async Task<Stream?> OpenReadAsync(string storedFileName, CancellationToken ct = default)
    {
        using var request = NewRequest(HttpMethod.Get, storedFileName);
        using var response = await http.SendAsync(request, ct);
        if (response.IsSuccessStatusCode)
        {
            // Photos are 5 MB at most, so holding one in memory is safe and lets the response be released here.
            var copy = new MemoryStream();
            await response.Content.CopyToAsync(copy, ct);
            copy.Position = 0;
            return copy;
        }
        if (await IsNotFoundAsync(response, ct))
            return null;
        throw await FailureAsync("read", response, ct);
    }

    public async Task DeleteAsync(string storedFileName, CancellationToken ct = default)
    {
        using var request = NewRequest(HttpMethod.Delete, storedFileName);
        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode && !await IsNotFoundAsync(response, ct))
            throw await FailureAsync("delete", response, ct);
    }

    private HttpRequestMessage NewRequest(HttpMethod method, string storedFileName)
    {
        var request = new HttpRequestMessage(method,
            $"object/{Uri.EscapeDataString(_options.ReferenceImageBucket)}/{Uri.EscapeDataString(Path.GetFileName(storedFileName))}");
        // Both headers, as Supabase's own client sends: new sb_secret_ keys are read from apikey, old ones from Authorization.
        request.Headers.Add("apikey", _options.SecretKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.SecretKey);
        return request;
    }

    /// <summary>
    /// Supabase answers a missing file with 400 and an "Object not found" body rather than 404. A missing bucket looks
    /// similar ("Bucket not found") but is a setup problem, so it must fail loudly rather than read as a missing photo.
    /// </summary>
    private static async Task<bool> IsNotFoundAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct);
        if (body.Contains("Bucket not found", StringComparison.OrdinalIgnoreCase))
            return false;
        return response.StatusCode == HttpStatusCode.NotFound
            || (response.StatusCode == HttpStatusCode.BadRequest && body.Contains("Object not found", StringComparison.OrdinalIgnoreCase));
    }

    private static async Task<Exception> FailureAsync(string action, HttpResponseMessage response, CancellationToken ct)
    {
        var reason = await response.Content.ReadAsStringAsync(ct);
        return new InvalidOperationException(
            $"Supabase Storage could not {action} a photo ({(int)response.StatusCode} {response.ReasonPhrase}): {reason[..Math.Min(reason.Length, 300)]}");
    }
}
