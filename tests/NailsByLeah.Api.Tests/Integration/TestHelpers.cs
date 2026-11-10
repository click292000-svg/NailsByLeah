using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };
}

public sealed record TestUser(HttpClient Client, int Id, string Username, string Email);

public static class TestHelpers
{
    public static Task<HttpResponseMessage> PostJsonAsync(this HttpClient client, string url, object body) =>
        client.PostAsJsonAsync(url, body, Json.Options);

    public static Task<HttpResponseMessage> PutJsonAsync(this HttpClient client, string url, object body) =>
        client.PutAsJsonAsync(url, body, Json.Options);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Json.Options))!;

    public static async Task<T> GetAsync<T>(this HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        return await response.ReadAsync<T>();
    }

    /// <summary>Asserts the status code and includes the response body in the failure message.</summary>
    public static async Task ShouldHaveStatus(this HttpResponseMessage response, HttpStatusCode expected)
    {
        if (response.StatusCode != expected)
            Assert.Fail($"Expected {(int)expected} {expected} but got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
    }

    public static async Task<JsonElement> ReadProblemAsync(this HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    public static string? ProblemCode(this JsonElement problem) =>
        problem.TryGetProperty("code", out var code) ? code.GetString() : null;

    public static IReadOnlyList<string> ErrorsFor(this JsonElement problem, string field) =>
        problem.TryGetProperty("errors", out var errors) && errors.TryGetProperty(field, out var messages)
            ? messages.EnumerateArray().Select(m => m.GetString()!).ToList()
            : [];

    public static RegisterRequest NewRegistration(this ApiFactory factory, string? firstName = null, string? username = null, string? phone = null)
    {
        var n = factory.NextUserNumber();
        return new RegisterRequest(
            firstName ?? "Test",
            "Client",
            username ?? $"client{n}",
            $"client{n}@test.local",
            phone ?? $"0917{n:D7}",
            ApiFactory.DefaultPassword,
            ApiFactory.DefaultPassword,
            AcceptTerms: true);
    }

    /// <summary>Registers, verifies the email and logs in a new client.</summary>
    public static async Task<TestUser> CreateClientAsync(this ApiFactory factory, RegisterRequest? registration = null)
    {
        var request = registration ?? factory.NewRegistration();
        var client = factory.NewClient();

        var registered = await client.PostJsonAsync("/api/auth/register", request);
        await registered.ShouldHaveStatus(HttpStatusCode.Created);
        var userId = (await registered.ReadAsync<RegisterResponse>()).UserId;

        var email = request.Email.Trim().ToLowerInvariant();
        var verified = await client.PostJsonAsync("/api/auth/verify-email",
            new VerifyEmailRequest(email, factory.Notifications.VerificationCodeFor(email)));
        await verified.ShouldHaveStatus(HttpStatusCode.OK);

        var login = await client.PostJsonAsync("/api/auth/login", new LoginRequest(request.Username, request.Password));
        await login.ShouldHaveStatus(HttpStatusCode.OK);
        return new TestUser(client, userId, request.Username.Trim(), email);
    }

    public static async Task<HttpClient> CreateAdminClientAsync(this ApiFactory factory)
    {
        var client = factory.NewClient();
        var login = await client.PostJsonAsync("/api/auth/login", new LoginRequest(ApiFactory.AdminUsername, ApiFactory.AdminPassword));
        await login.ShouldHaveStatus(HttpStatusCode.OK);
        return client;
    }

    public static CreateBookingRequest NewBooking(
        (DateOnly Date, TimeOnly Time) slot,
        int serviceId = 1,
        Guid? idempotencyKey = null,
        bool depositAcknowledged = true,
        params AddOnSelection[] addOns) =>
        new(serviceId, addOns, slot.Date, slot.Time, PaymentMethod.GCash, depositAcknowledged,
            idempotencyKey ?? Guid.NewGuid(), NailColor: Color, TermsVersion: TermsVersion);

    /// <summary>The Terms version in force, which every booking must have agreed to.</summary>
    public static readonly string TermsVersion = new NailsByLeah.Api.Configuration.LegalOptions().TermsVersion;

    /// <summary>A colour from the list in appsettings.json.</summary>
    public const string Color = "#06";

    /// <summary>The administrator confirms a paid booking (bookings stay Pending after payment until this).</summary>
    public static async Task<BookingResponse> ConfirmAsync(this HttpClient admin, int bookingId)
    {
        var response = await admin.PostAsync($"/api/admin/bookings/{bookingId}/confirm", null);
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        return await response.ReadAsync<BookingResponse>();
    }

    public static async Task<CreateBookingResponse> BookAsync(this HttpClient client, CreateBookingRequest request)
    {
        var response = await client.PostJsonAsync("/api/bookings", request);
        await response.ShouldHaveStatus(HttpStatusCode.Created);
        return await response.ReadAsync<CreateBookingResponse>();
    }
}
