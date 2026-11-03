using System.Net;
using System.Net.Http.Headers;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Nail design reference photos: validation, private storage, attaching to a booking, who can see them.</summary>
public sealed class ReferenceImageTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly byte[] Png =
    [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
        0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D, 0x1D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, byte[] bytes, string fileName = "design.png", string contentType = "image/png")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return await client.PostAsync("/api/reference-images", new MultipartFormDataContent { { file, "file", fileName } });
    }

    private static async Task<ReferenceImageResponse> UploadOkAsync(HttpClient client)
    {
        var response = await UploadAsync(client, Png);
        await response.ShouldHaveStatus(HttpStatusCode.Created);
        return await response.ReadAsync<ReferenceImageResponse>();
    }

    [Fact]
    public async Task A_photo_uploaded_while_booking_is_attached_to_the_booking_and_visible_to_the_salon()
    {
        var client = await factory.CreateClientAsync();
        var image = await UploadOkAsync(client.Client);
        Assert.Equal("image/png", image.ContentType);

        // Until the booking is made, the photo is "pending", which is how a saved booking draft gets it back.
        var pending = await client.Client.GetAsync<List<ReferenceImageResponse>>("/api/reference-images/pending");
        Assert.Contains(pending, p => p.Id == image.Id);

        var booked = await client.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()) with { ReferenceImageIds = [image.Id] });
        Assert.Equal([image.Id], booked.Booking.ReferenceImages.Select(r => r.Id));
        Assert.DoesNotContain(await client.Client.GetAsync<List<ReferenceImageResponse>>("/api/reference-images/pending"), p => p.Id == image.Id);

        // The salon sees it on the booking and can open the file.
        var admin = await factory.CreateAdminClientAsync();
        var adminView = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booked.Booking.Id}");
        Assert.Equal([image.Id], adminView.ReferenceImages.Select(r => r.Id));
        var file = await admin.GetAsync($"/api/reference-images/{image.Id}");
        await file.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("image/png", file.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Png, await file.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Other_clients_and_anonymous_users_cannot_see_a_photo()
    {
        var owner = await factory.CreateClientAsync();
        var other = await factory.CreateClientAsync();
        var image = await UploadOkAsync(owner.Client);

        await (await owner.Client.GetAsync($"/api/reference-images/{image.Id}")).ShouldHaveStatus(HttpStatusCode.OK);
        await (await other.Client.GetAsync($"/api/reference-images/{image.Id}")).ShouldHaveStatus(HttpStatusCode.NotFound);
        await (await factory.NewClient().GetAsync($"/api/reference-images/{image.Id}")).ShouldHaveStatus(HttpStatusCode.Unauthorized);

        // Nor can another client attach it to their own booking.
        var stolen = await other.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()) with { ReferenceImageIds = [image.Id] });
        await stolen.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal([ReferenceImageService.UnavailableMessage], (await stolen.ReadProblemAsync()).ErrorsFor("referenceImageIds"));
    }

    [Fact]
    public async Task Files_that_are_not_images_are_rejected_whatever_their_name_says()
    {
        var client = (await factory.CreateClientAsync()).Client;

        var script = await UploadAsync(client, "<script>alert(1)</script>"u8.ToArray(), "design.png", "image/png");
        await script.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal([ReferenceImageService.TypeMessage], (await script.ReadProblemAsync()).ErrorsFor("file"));

        var empty = await UploadAsync(client, [], "empty.png");
        await empty.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Images_over_5_MB_are_rejected()
    {
        var client = (await factory.CreateClientAsync()).Client;
        var tooBig = new byte[5 * 1024 * 1024 + 1];
        Png.CopyTo(tooBig, 0);

        var response = await UploadAsync(client, tooBig);

        Assert.True(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.RequestEntityTooLarge,
            $"Expected 400 or 413 but got {(int)response.StatusCode}");
    }

    [Fact]
    public async Task Administrators_cannot_upload_and_a_booking_takes_at_most_three_photos()
    {
        var admin = await factory.CreateAdminClientAsync();
        await (await UploadAsync(admin, Png)).ShouldHaveStatus(HttpStatusCode.Forbidden);

        var client = (await factory.CreateClientAsync()).Client;
        var ids = new List<int>();
        for (var i = 0; i < 4; i++)
            ids.Add((await UploadOkAsync(client)).Id);

        var response = await client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()) with { ReferenceImageIds = ids });
        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_pending_photo_can_be_removed_but_one_on_a_booking_cannot()
    {
        var client = (await factory.CreateClientAsync()).Client;
        var removable = await UploadOkAsync(client);
        var kept = await UploadOkAsync(client);
        await client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()) with { ReferenceImageIds = [kept.Id] });

        await (await client.DeleteAsync($"/api/reference-images/{removable.Id}")).ShouldHaveStatus(HttpStatusCode.NoContent);
        await (await client.GetAsync($"/api/reference-images/{removable.Id}")).ShouldHaveStatus(HttpStatusCode.NotFound);
        await (await client.DeleteAsync($"/api/reference-images/{kept.Id}")).ShouldHaveStatus(HttpStatusCode.Conflict);
    }
}
