using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>When the photo storage is down, clients get a clear answer and records stay correct.</summary>
public sealed class PhotoStoreFailureTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    [Fact]
    public async Task The_tests_never_use_the_real_bucket()
    {
        // Developers keep their Supabase key in user secrets, which the tests also load.
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.IsType<FileSystemReferenceImageStore>(scope.ServiceProvider.GetRequiredService<IReferenceImageStore>());
    }

    [Fact]
    public async Task An_upload_during_a_storage_outage_gets_a_clear_message_and_saves_nothing()
    {
        var user = await factory.CreateClientAsync();
        await using var host = WithBrokenStore();
        var client = await SignInAsync(host, user);

        var response = await client.PostAsync("/api/reference-images", PhotoForm());

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("image_store_unavailable", (await response.ReadProblemAsync()).ProblemCode());
        Assert.False(factory.WithDb(db => db.ReferenceImages.Any(r => r.ClientId == user.Id)));
    }

    [Fact]
    public async Task Removing_a_photo_succeeds_even_if_the_file_cannot_be_deleted_yet()
    {
        var user = await factory.CreateClientAsync();
        var uploaded = await (await user.Client.PostAsync("/api/reference-images", PhotoForm())).ReadAsync<ReferenceImageResponse>();
        await using var host = WithBrokenStore();
        var client = await SignInAsync(host, user);

        await (await client.DeleteAsync($"/api/reference-images/{uploaded.Id}")).ShouldHaveStatus(HttpStatusCode.NoContent);

        Assert.True(factory.WithDb(db => db.ReferenceImages.Single(r => r.Id == uploaded.Id).IsDeleted));
    }

    private WebApplicationFactory<Program> WithBrokenStore() => factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
    {
        services.RemoveAll<IReferenceImageStore>();
        services.AddSingleton<IReferenceImageStore, BrokenStore>();
    }));

    private static async Task<HttpClient> SignInAsync(WebApplicationFactory<Program> host, TestUser user)
    {
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });
        await (await client.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword))).ShouldHaveStatus(HttpStatusCode.OK);
        return client;
    }

    private static MultipartFormDataContent PhotoForm()
    {
        var file = new ByteArrayContent(Png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { file, "file", "design.png" } };
    }

    private sealed class BrokenStore : IReferenceImageStore
    {
        private static readonly TaskCanceledException Timeout = new("HttpClient.Timeout elapsed");

        public Task<string> SaveAsync(ReadOnlyMemory<byte> content, string extension, CancellationToken ct = default) => Task.FromException<string>(Timeout);
        public Task<Stream?> OpenReadAsync(string storedFileName, CancellationToken ct = default) => Task.FromException<Stream?>(Timeout);
        public Task DeleteAsync(string storedFileName, CancellationToken ct = default) => Task.FromException(Timeout);
    }
}
