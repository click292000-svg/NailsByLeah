using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Registration, verification, login, lockout, sessions and password reset (backend doc 2, tests 9.1.3–9.1.5, 9.1.12).</summary>
public sealed class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact] // 9.1.3
    public async Task Registration_with_76_character_name_is_rejected()
    {
        var response = await factory.NewClient().PostJsonAsync("/api/auth/register",
            factory.NewRegistration(firstName: new string('a', 76)));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Contains("First Name must be 75 characters or fewer.", (await response.ReadProblemAsync()).ErrorsFor("firstName"));
    }

    [Fact]
    public async Task Registration_with_75_character_name_and_special_characters_is_accepted()
    {
        var name = "Ma. José-Ñiña #1 " + new string('x', 58);
        Assert.Equal(75, name.Length);

        var user = await factory.CreateClientAsync(factory.NewRegistration(firstName: name));
        var me = await user.Client.GetAsync<UserProfileResponse>("/api/auth/me");
        Assert.Equal(name, me.FirstName);
    }

    [Fact] // 9.1.4
    public async Task Registration_with_existing_username_returns_username_error()
    {
        var first = factory.NewRegistration();
        await factory.CreateClientAsync(first);

        var response = await factory.NewClient().PostJsonAsync("/api/auth/register", factory.NewRegistration(username: first.Username));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Contains("Username is already taken.", (await response.ReadProblemAsync()).ErrorsFor("username"));
    }

    [Fact] // Ref 9.2
    public async Task Username_availability_reports_taken_usernames()
    {
        var existing = await factory.CreateClientAsync();
        var client = factory.NewClient();

        var taken = await client.GetAsync<UsernameAvailabilityResponse>($"/api/auth/username-availability?username={existing.Username}");
        var free = await client.GetAsync<UsernameAvailabilityResponse>("/api/auth/username-availability?username=nobody-has-this-name");

        Assert.False(taken.Available);
        Assert.Equal("Username is already taken.", taken.Message);
        Assert.True(free.Available);
    }

    [Fact] // Ref 1.6
    public async Task Registration_without_accepting_terms_is_rejected()
    {
        var response = await factory.NewClient().PostJsonAsync("/api/auth/register", factory.NewRegistration() with { AcceptTerms = false });

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await response.ReadProblemAsync()).ErrorsFor("acceptTerms"));
    }

    [Theory] // Ref 1.3: exactly 11 digits, checked by the server too
    [InlineData("abc#", PhoneRule.DigitsOnly)]
    [InlineData("0918-123 4567", PhoneRule.DigitsOnly)]
    [InlineData("0918123456", PhoneRule.TooShort)]
    [InlineData("091812345678", PhoneRule.TooLong)]
    public async Task Phone_numbers_that_are_not_exactly_11_digits_are_rejected(string phone, string message)
    {
        var response = await factory.NewClient().PostJsonAsync("/api/auth/register", factory.NewRegistration(phone: phone));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal([message], (await response.ReadProblemAsync()).ErrorsFor("phoneNumber"));
    }

    [Fact]
    public async Task An_11_digit_phone_number_is_stored_as_entered()
    {
        var n = factory.NextUserNumber();
        var user = await factory.CreateClientAsync(factory.NewRegistration(phone: $"0918{n:D7}"));
        var me = await user.Client.GetAsync<UserProfileResponse>("/api/auth/me");
        Assert.Equal($"0918{n:D7}", me.PhoneNumber);
    }

    [Theory] // Ref 8.2
    [InlineData("short1")]
    [InlineData("lettersonly")]
    [InlineData("12345678")]
    public async Task Weak_passwords_are_rejected(string password)
    {
        var response = await factory.NewClient().PostJsonAsync("/api/auth/register",
            factory.NewRegistration() with { Password = password, ConfirmPassword = password });

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await response.ReadProblemAsync()).ErrorsFor("password"));
    }

    [Fact] // Ref 8.1, 9.4
    public async Task Passwords_are_stored_as_bcrypt_hashes_and_terms_acceptance_is_recorded()
    {
        var user = await factory.CreateClientAsync();
        var stored = factory.WithDb(db => db.Users.Single(u => u.Id == user.Id));

        Assert.StartsWith("$2", stored.PasswordHash);
        Assert.DoesNotContain(ApiFactory.DefaultPassword, stored.PasswordHash);
        Assert.Equal("2.3", stored.TermsVersion);
        Assert.NotNull(stored.TermsAcceptedAt);
    }

    [Fact] // Ref 9.1
    public async Task Unverified_accounts_cannot_log_in()
    {
        var registration = factory.NewRegistration();
        var client = factory.NewClient();
        await (await client.PostJsonAsync("/api/auth/register", registration)).ShouldHaveStatus(HttpStatusCode.Created);

        var login = await client.PostJsonAsync("/api/auth/login", new LoginRequest(registration.Username, registration.Password));

        await login.ShouldHaveStatus(HttpStatusCode.Forbidden);
        Assert.Equal("email_not_verified", (await login.ReadProblemAsync()).ProblemCode());
    }

    [Fact] // 9.1.5
    public async Task Expired_password_reset_link_is_rejected()
    {
        var user = await factory.CreateClientAsync();
        var client = factory.NewClient();
        await (await client.PostJsonAsync("/api/auth/forgot-password", new EmailRequest(user.Email))).ShouldHaveStatus(HttpStatusCode.OK);
        var token = factory.Notifications.ResetTokenFor(user.Email);

        await (await client.PostJsonAsync("/api/auth/reset-password/validate", new TokenRequest(token)))
            .ShouldHaveStatus(HttpStatusCode.OK);

        factory.Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(1));
        var check = await client.PostJsonAsync("/api/auth/reset-password/validate", new TokenRequest(token));
        var response = await client.PostJsonAsync("/api/auth/reset-password", new ResetPasswordRequest(token, "BrandNew123"));

        await check.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal("token_expired", (await check.ReadProblemAsync()).ProblemCode());
        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal("token_expired", (await response.ReadProblemAsync()).ProblemCode());
    }

    [Fact] // Ref 1.4
    public async Task Password_reset_link_works_once_and_signs_out_old_sessions()
    {
        var user = await factory.CreateClientAsync();
        var anonymous = factory.NewClient();
        await anonymous.PostJsonAsync("/api/auth/forgot-password", new EmailRequest(user.Email));
        var token = factory.Notifications.ResetTokenFor(user.Email);

        var reset = await anonymous.PostJsonAsync("/api/auth/reset-password", new ResetPasswordRequest(token, "BrandNew123"));
        await reset.ShouldHaveStatus(HttpStatusCode.OK);

        var reused = await anonymous.PostJsonAsync("/api/auth/reset-password", new ResetPasswordRequest(token, "Another123"));
        await reused.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal("token_invalid", (await reused.ReadProblemAsync()).ProblemCode());

        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await (await anonymous.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword)))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await (await anonymous.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, "BrandNew123")))
            .ShouldHaveStatus(HttpStatusCode.OK);
    }

    // "Forgot password" and "resend code" must not reveal whether an email is registered: same status, same words.
    [Theory]
    [InlineData("/api/auth/forgot-password")]
    [InlineData("/api/auth/resend-verification")]
    public async Task Email_endpoints_answer_the_same_for_registered_and_unknown_emails(string url)
    {
        var registered = factory.NewRegistration();
        await (await factory.NewClient().PostJsonAsync("/api/auth/register", registered)).ShouldHaveStatus(HttpStatusCode.Created);
        factory.Clock.Advance(TimeSpan.FromSeconds(61)); // past the wait that sign-up's own code started

        var forReal = await factory.NewClient().PostJsonAsync(url, new EmailRequest(registered.Email));
        var forUnknown = await factory.NewClient().PostJsonAsync(url, new EmailRequest("nobody@test.local"));

        Assert.Equal(forUnknown.StatusCode, forReal.StatusCode);
        Assert.Equal(HttpStatusCode.OK, forReal.StatusCode);
        Assert.Equal(await forUnknown.Content.ReadAsStringAsync(), await forReal.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Another_verification_code_can_only_be_asked_for_a_minute_after_the_last()
    {
        var registration = factory.NewRegistration();
        var client = factory.NewClient();
        await (await client.PostJsonAsync("/api/auth/register", registration)).ShouldHaveStatus(HttpStatusCode.Created);

        // Sign-up sent the first code, so asking again straight away is refused, with how long is left.
        var tooSoon = await client.PostJsonAsync("/api/auth/resend-verification", new EmailRequest(registration.Email));
        await tooSoon.ShouldHaveStatus(HttpStatusCode.TooManyRequests);
        var problem = await tooSoon.ReadProblemAsync();
        Assert.Equal("resend_cooldown", problem.ProblemCode());
        Assert.InRange(problem.GetProperty("retryAfterSeconds").GetInt32(), 1, 60);

        factory.Clock.Advance(TimeSpan.FromSeconds(61));
        await (await client.PostJsonAsync("/api/auth/resend-verification", new EmailRequest(registration.Email))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await client.PostJsonAsync("/api/auth/resend-verification", new EmailRequest(registration.Email)))
            .ShouldHaveStatus(HttpStatusCode.TooManyRequests);

        // An unknown address waits too, so the answer can't tell the two apart.
        await (await client.PostJsonAsync("/api/auth/resend-verification", new EmailRequest("nobody.twice@test.local"))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await client.PostJsonAsync("/api/auth/resend-verification", new EmailRequest("nobody.twice@test.local")))
            .ShouldHaveStatus(HttpStatusCode.TooManyRequests);
    }

    [Fact] // The token goes after "#", which browsers never send to a server, so it stays out of hosting logs.
    public async Task Reset_link_keeps_the_token_out_of_server_addresses()
    {
        var user = await factory.CreateClientAsync();
        await (await factory.NewClient().PostJsonAsync("/api/auth/forgot-password", new EmailRequest(user.Email))).ShouldHaveStatus(HttpStatusCode.OK);

        var link = factory.Notifications.ResetLinkFor(user.Email);
        Assert.Contains("/reset-password#token=", link);
        Assert.DoesNotContain("?", link);
    }

    [Fact] // A failed email is logged, not shown: otherwise only real accounts would get an error.
    public async Task Forgot_password_answers_normally_when_the_email_cannot_be_sent()
    {
        var user = await factory.CreateClientAsync();
        factory.Notifications.FailNextEmail();

        var response = await factory.NewClient().PostJsonAsync("/api/auth/forgot-password", new EmailRequest(user.Email));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Contains("If that email address is registered", await response.Content.ReadAsStringAsync());
    }

    [Fact] // 9.1.12
    public async Task Five_failed_logins_lock_the_account_for_15_minutes()
    {
        var user = await factory.CreateClientAsync();
        var client = factory.NewClient();

        for (var attempt = 1; attempt <= 4; attempt++)
            await (await client.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, "WrongPass999")))
                .ShouldHaveStatus(HttpStatusCode.Unauthorized);

        var fifth = await client.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, "WrongPass999"));
        await fifth.ShouldHaveStatus(HttpStatusCode.Locked);

        // Even the right password is refused while locked.
        await (await client.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword)))
            .ShouldHaveStatus(HttpStatusCode.Locked);

        factory.Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(1));
        await (await client.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword)))
            .ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact] // Ref 8.4
    public async Task Sessions_expire_after_30_minutes_of_inactivity()
    {
        var user = await factory.CreateClientAsync();

        factory.Clock.Advance(TimeSpan.FromMinutes(25));
        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.OK);

        // Activity restarts the timer, so another 25 minutes is still fine.
        factory.Clock.Advance(TimeSpan.FromMinutes(25));
        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.OK);

        factory.Clock.Advance(TimeSpan.FromMinutes(31));
        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
