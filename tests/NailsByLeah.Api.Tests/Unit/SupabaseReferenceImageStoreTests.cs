using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>Photos in Supabase Storage: the requests it receives, and what happens when it refuses. No real bucket is used.</summary>
public sealed class SupabaseReferenceImageStoreTests
{
    private const string Key = "sb_secret_test";

    [Fact]
    public async Task Saves_to_the_private_bucket_under_a_random_name_with_the_key()
    {
        var supabase = new FakeSupabase(HttpStatusCode.OK, "{}");

        var name = await Store(supabase).SaveAsync(new byte[] { 1, 2, 3 }, ".jpg");

        Assert.EndsWith(".jpg", name);
        var request = Assert.Single(supabase.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal($"https://project.supabase.co/storage/v1/object/reference-images/{name}", request.Uri);
        Assert.Equal((Key, $"Bearer {Key}"), (request.ApiKey, request.Authorization));
        Assert.Equal("image/jpeg", request.ContentType);
        Assert.Equal([1, 2, 3], request.Body);
    }

    [Fact]
    public async Task Reads_a_photo_back()
    {
        var supabase = new FakeSupabase(HttpStatusCode.OK, "photo");

        await using var content = await Store(supabase).OpenReadAsync("abc.jpg");

        using var reader = new StreamReader(content!);
        Assert.Equal("photo", await reader.ReadToEndAsync());
        Assert.Equal(HttpMethod.Get, Assert.Single(supabase.Requests).Method);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, "{}")]
    [InlineData(HttpStatusCode.BadRequest, """{"statusCode":"404","error":"not_found","message":"Object not found"}""")]
    public async Task A_missing_photo_reads_as_null_and_deleting_it_is_fine(HttpStatusCode status, string body)
    {
        var store = Store(new FakeSupabase(status, body));

        Assert.Null(await store.OpenReadAsync("gone.jpg"));
        await store.DeleteAsync("gone.jpg");
    }

    [Fact] // Supabase's real answer when the bucket doesn't exist: a setup problem must not look like a missing photo.
    public async Task A_missing_bucket_is_an_error_not_a_missing_photo()
    {
        var store = Store(new FakeSupabase(HttpStatusCode.BadRequest,
            """{"statusCode":"404","error":"Bucket not found","message":"Bucket not found","code":"NoSuchBucket"}"""));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => store.OpenReadAsync("abc.jpg"));

        Assert.Contains("Bucket not found", error.Message);
        await Assert.ThrowsAsync<InvalidOperationException>(() => store.DeleteAsync("abc.jpg"));
    }

    [Fact]
    public async Task A_refused_upload_fails_with_the_reason_and_without_the_key()
    {
        var store = Store(new FakeSupabase(HttpStatusCode.Forbidden, """{"message":"signature verification failed"}"""));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => store.SaveAsync(new byte[] { 1 }, ".png"));

        Assert.Contains("403", error.Message);
        Assert.Contains("signature verification failed", error.Message);
        Assert.DoesNotContain(Key, error.Message);
    }

    [Fact]
    public async Task A_stored_name_cannot_reach_outside_the_bucket()
    {
        var supabase = new FakeSupabase(HttpStatusCode.OK, "{}");

        await Store(supabase).DeleteAsync("../other-bucket/secret.jpg");

        Assert.Equal("https://project.supabase.co/storage/v1/object/reference-images/secret.jpg", Assert.Single(supabase.Requests).Uri);
    }

    private static SupabaseReferenceImageStore Store(FakeSupabase supabase)
    {
        var options = new SupabaseOptions { Url = "https://project.supabase.co", SecretKey = Key };
        return new SupabaseReferenceImageStore(new HttpClient(supabase) { BaseAddress = new Uri(options.StorageBaseUrl) }, Options.Create(options));
    }

    private sealed record SentRequest(HttpMethod Method, string Uri, string? ApiKey, string? Authorization, string? ContentType, byte[] Body);

    private sealed class FakeSupabase(HttpStatusCode status, string responseBody) : HttpMessageHandler
    {
        public List<SentRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(new SentRequest(request.Method, request.RequestUri!.ToString(),
                request.Headers.TryGetValues("apikey", out var keys) ? keys.Single() : null,
                request.Headers.Authorization?.ToString(),
                request.Content?.Headers.ContentType?.MediaType,
                request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(cancellationToken)));
            return new HttpResponseMessage(status) { Content = new StringContent(responseBody, Encoding.UTF8) };
        }
    }
}
