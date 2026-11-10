using System.Net;
using System.Net.Http.Headers;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>A client's own photo: only they change it; they and Leyah can see it.</summary>
public sealed class ClientProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    private static MultipartFormDataContent Photo(byte[] bytes)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { file, "file", "me.png" } };
    }

    [Fact]
    public async Task A_client_uploads_a_photo_that_they_and_Leyah_can_see_but_other_clients_cannot()
    {
        var user = await factory.CreateClientAsync();
        var other = await factory.CreateClientAsync();

        var profile = await (await user.Client.PostAsync("/api/auth/me/photo", Photo(Png))).ReadAsync<UserProfileResponse>();
        Assert.StartsWith("/api/auth/me/photo?v=", profile.PhotoUrl);
        Assert.Equal(Png, await (await user.Client.GetAsync(profile.PhotoUrl)).Content.ReadAsByteArrayAsync());

        // Another client asking for "their own" photo gets theirs (none), never this one.
        await (await other.Client.GetAsync("/api/auth/me/photo")).ShouldHaveStatus(HttpStatusCode.NotFound);
        var meId = (await user.Client.GetAsync<UserProfileResponse>("/api/auth/me")).Id;
        await (await other.Client.GetAsync($"/api/admin/clients/{meId}/photo")).ShouldHaveStatus(HttpStatusCode.Forbidden);

        var admin = await factory.CreateAdminClientAsync();
        var seen = await admin.GetAsync($"/api/admin/clients/{meId}/photo");
        await seen.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(Png, await seen.Content.ReadAsByteArrayAsync());

        var removed = await (await user.Client.DeleteAsync("/api/auth/me/photo")).ReadAsync<UserProfileResponse>();
        Assert.Null(removed.PhotoUrl);
        await (await admin.GetAsync($"/api/admin/clients/{meId}/photo")).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_file_that_is_not_a_picture_is_refused()
    {
        var user = await factory.CreateClientAsync();
        var response = await user.Client.PostAsync("/api/auth/me/photo", Photo("not an image"u8.ToArray()));
        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await response.ReadProblemAsync()).ErrorsFor("file"));
    }
}
