using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IRegistrationService registration,
    IAuthService auth,
    IPasswordResetService passwordReset,
    IUserRepository users) : ControllerBase
{
    private const string ResetRequestedMessage = "If that email address is registered, a password reset link has been sent. It expires in 15 minutes.";

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("register")]
    public async Task<ActionResult<RegisterResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var user = await registration.RegisterAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created,
            new RegisterResponse(user.Id, "Registration successful. Check your email for the verification code to activate your account."));
    }

    /// <summary>Real-time username check for the registration form (Ref 9.2).</summary>
    [AllowAnonymous]
    [HttpGet("username-availability")]
    public Task<UsernameAvailabilityResponse> UsernameAvailability([FromQuery] string username, CancellationToken ct) =>
        registration.CheckUsernameAsync(username, ct);

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    [HttpPost("verify-email")]
    public async Task<MessageResponse> VerifyEmail(VerifyEmailRequest request, CancellationToken ct)
    {
        await registration.VerifyEmailAsync(request, ct);
        return new MessageResponse("Your email address is verified. You can now log in.");
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("resend-verification")]
    public async Task<MessageResponse> ResendVerification(EmailRequest request, CancellationToken ct)
    {
        await registration.ResendVerificationAsync(request.Email, ct);
        return new MessageResponse("If that account still needs verification, a new code has been sent.");
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    [HttpPost("login")]
    public async Task<UserProfileResponse> Login(LoginRequest request, CancellationToken ct)
    {
        var user = await auth.LoginAsync(request, ct);
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim(ClaimNames.SecurityStamp, user.SecurityStamp),
        ], CookieAuthenticationDefaults.AuthenticationScheme);

        // Session cookie; the server-side ticket expires after 30 idle minutes (Ref 8.4).
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = false });
        return ToProfile(user);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<UserProfileResponse> Me(CancellationToken ct) =>
        ToProfile(await users.GetByIdAsync(User.GetUserId(), ct) ?? throw new UnauthorizedAppException("Please log in again."));

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("forgot-password")]
    public async Task<MessageResponse> ForgotPassword(EmailRequest request, CancellationToken ct)
    {
        await passwordReset.RequestResetAsync(request.Email, ct);
        return new MessageResponse(ResetRequestedMessage);
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    [HttpGet("reset-password/validate")]
    public async Task<MessageResponse> ValidateResetToken([FromQuery] string token, CancellationToken ct)
    {
        await passwordReset.ValidateTokenAsync(token, ct);
        return new MessageResponse("This password reset link is valid.");
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    [HttpPost("reset-password")]
    public async Task<MessageResponse> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await passwordReset.ResetPasswordAsync(request, ct);
        return new MessageResponse("Your password has been changed. You can now log in with your new password.");
    }

    private static UserProfileResponse ToProfile(User u) =>
        new(u.Id, u.FirstName, u.LastName, u.Username, u.Email, u.PhoneNumber, u.Role.ToString());
}
