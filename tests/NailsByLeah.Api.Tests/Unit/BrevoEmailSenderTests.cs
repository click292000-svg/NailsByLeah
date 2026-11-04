using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>Emails sent through Brevo's HTTPS API: the request Brevo receives, and what happens when it refuses.</summary>
public sealed class BrevoEmailSenderTests
{
    [Fact]
    public async Task Sends_the_email_to_Brevo_with_the_key_and_the_verified_sender()
    {
        var brevo = new FakeBrevo(HttpStatusCode.Created, """{"messageId":"<1@smtp-relay.mailin.fr>"}""");

        await Sender(brevo).SendAsync("kyla@example.test", "Kyla Santos", "Verify your account", "Your code is 123456");

        var request = Assert.Single(brevo.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://api.brevo.com/v3/smtp/email", request.Uri);
        Assert.Equal("xkeysib-test", request.ApiKey);

        using var body = JsonDocument.Parse(request.Body);
        var root = body.RootElement;
        Assert.Equal("salon@example.test", root.GetProperty("sender").GetProperty("email").GetString());
        Assert.Equal("Nails by Leyah", root.GetProperty("sender").GetProperty("name").GetString());
        var to = Assert.Single(root.GetProperty("to").EnumerateArray());
        Assert.Equal("kyla@example.test", to.GetProperty("email").GetString());
        Assert.Equal("Kyla Santos", to.GetProperty("name").GetString());
        Assert.Equal("Verify your account", root.GetProperty("subject").GetString());
        Assert.Equal("Your code is 123456", root.GetProperty("textContent").GetString());
    }

    [Fact]
    public async Task A_refused_email_fails_with_Brevos_reason_and_without_the_key()
    {
        var brevo = new FakeBrevo(HttpStatusCode.BadRequest, """{"code":"invalid_parameter","message":"sender is not valid"}""");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => Sender(brevo).SendAsync("kyla@example.test", "Kyla Santos", "Reset your password", "Use this link"));

        Assert.Contains("400", error.Message);
        Assert.Contains("sender is not valid", error.Message);
        Assert.DoesNotContain("xkeysib-test", error.Message);
    }

    [Fact] // The error ends up in the server logs, which the host keeps: no client email addresses in it.
    public async Task A_refused_email_does_not_repeat_the_clients_address()
    {
        var brevo = new FakeBrevo(HttpStatusCode.BadRequest,
            """{"code":"invalid_parameter","message":"email kyla.santos@example.test is not valid"}""");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => Sender(brevo).SendAsync("kyla.santos@example.test", "Kyla Santos", "Reset your password", "Use this link"));

        Assert.DoesNotContain("kyla.santos@example.test", error.Message);
        Assert.Contains("email [email] is not valid", error.Message);
    }

    private static BrevoEmailSender Sender(FakeBrevo brevo) => new(
        new HttpClient(brevo) { BaseAddress = new Uri(new BrevoOptions().BaseUrl) },
        Options.Create(new BrevoOptions { ApiKey = "xkeysib-test" }),
        Options.Create(new EmailOptions { FromAddress = "salon@example.test", FromName = "Nails by Leyah" }));

    private sealed record SentRequest(HttpMethod Method, string Uri, string? ApiKey, string Body);

    /// <summary>Stands in for api.brevo.com: records each request and answers with a fixed response.</summary>
    private sealed class FakeBrevo(HttpStatusCode status, string responseBody) : HttpMessageHandler
    {
        public List<SentRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(new SentRequest(request.Method, request.RequestUri!.ToString(),
                request.Headers.TryGetValues("api-key", out var keys) ? keys.Single() : null,
                await request.Content!.ReadAsStringAsync(cancellationToken)));
            return new HttpResponseMessage(status) { Content = new StringContent(responseBody) };
        }
    }
}
