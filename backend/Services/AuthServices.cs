using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

public interface IRegistrationService
{
    Task<User> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<UsernameAvailabilityResponse> CheckUsernameAsync(string username, CancellationToken ct = default);
    Task VerifyEmailAsync(VerifyEmailRequest request, CancellationToken ct = default);
    Task ResendVerificationAsync(string email, CancellationToken ct = default);
}

/// <summary>Creates client accounts and verifies their email addresses (Ref 1.2, 1.6, 9.1, 9.4).</summary>
public sealed class RegistrationService(
    IUserRepository users,
    IUserTokenRepository tokens,
    IUnitOfWork unitOfWork,
    IPasswordHasher hasher,
    IBackgroundNotifications background,
    IAuditLogger audit,
    ISalonClock clock,
    IOptions<AuthOptions> authOptions,
    IOptions<LegalOptions> legalOptions) : IRegistrationService
{
    public const string UsernameTakenMessage = "Username is already taken.";

    private readonly AuthOptions _auth = authOptions.Value;

    public async Task<User> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        if (!request.AcceptTerms)
            throw new ValidationAppException("acceptTerms", "You must accept the Terms & Conditions to register.");

        // Enforced here as well as in the request validator, so no caller can skip it.
        if (PhoneRule.Problem(request.PhoneNumber) is { } phoneProblem)
            throw new ValidationAppException("phoneNumber", phoneProblem);

        var username = InputNormalizer.Text(request.Username);
        var email = InputNormalizer.Email(request.Email);
        var phone = InputNormalizer.Text(request.PhoneNumber);

        var errors = new Dictionary<string, string[]>();
        if (await users.UsernameExistsAsync(username, ct))
            errors["username"] = [UsernameTakenMessage];
        if (await users.EmailExistsAsync(email, ct))
            errors["email"] = ["An account with this email address already exists."];
        if (await users.PhoneNumberExistsAsync(phone, ct))
            errors["phoneNumber"] = ["This phone number is already registered."];
        if (errors.Count > 0)
            throw new ValidationAppException(errors);

        var now = clock.UtcNow;
        var user = new User
        {
            FirstName = InputNormalizer.Text(request.FirstName),
            LastName = InputNormalizer.Text(request.LastName),
            Username = username,
            Email = email,
            PhoneNumber = phone,
            PasswordHash = hasher.Hash(request.Password),
            Role = UserRole.Client,
            TermsVersion = legalOptions.Value.TermsVersion,
            TermsAcceptedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var code = SecureTokens.NewNumericCode();
        try
        {
            await unitOfWork.ExecuteInTransactionAsync(async innerCt =>
            {
                users.Add(user);
                await unitOfWork.SaveChangesAsync(innerCt);
                tokens.Add(NewVerificationToken(user.Id, code, now));
                audit.Record(AuditActions.UserRegistered, nameof(User), user.Id, $"Terms v{user.TermsVersion} accepted", user.Id);
                return user.Id;
            }, ct);
        }
        catch (UniqueConstraintViolationException ex)
        {
            // Another registration with the same value won the race after our checks.
            throw ex.IndexName switch
            {
                IndexNames.UsersUsername => new ValidationAppException("username", UsernameTakenMessage, "username_taken"),
                IndexNames.UsersEmail => new ValidationAppException("email", "An account with this email address already exists."),
                IndexNames.UsersPhoneNumber => new ValidationAppException("phoneNumber", "This phone number is already registered."),
                _ => ex,
            };
        }

        // The account is saved, so a failed email must not look like a failed sign-up: "resend code" recovers it.
        await background.EnqueueAsync((n, stop) => n.SendEmailVerificationAsync(user, code, stop), "verification code email");
        return user;
    }

    public async Task<UsernameAvailabilityResponse> CheckUsernameAsync(string username, CancellationToken ct = default)
    {
        var normalized = InputNormalizer.Text(username);
        if (normalized.Length is < InputLimits.UsernameMinLength or > InputLimits.UsernameMaxLength)
            return new(normalized, false,
                $"Username must be {InputLimits.UsernameMinLength} to {InputLimits.UsernameMaxLength} characters.");

        var taken = await users.UsernameExistsAsync(normalized, ct);
        return new(normalized, !taken, taken ? UsernameTakenMessage : "Username is available.");
    }

    public async Task VerifyEmailAsync(VerifyEmailRequest request, CancellationToken ct = default)
    {
        const string invalidMessage = "The verification code is invalid.";
        var user = await users.FindByEmailAsync(InputNormalizer.Email(request.Email), ct)
                   ?? throw new ValidationAppException("code", invalidMessage, "token_invalid");
        if (user.EmailVerified)
            return;

        var token = await tokens.GetLatestUnconsumedAsync(user.Id, UserTokenPurpose.EmailVerification, ct)
                    ?? throw new ValidationAppException("code", invalidMessage, "token_invalid");

        var now = clock.UtcNow;
        if (token.IsExpired(now))
            throw new ValidationAppException("code", "This verification code has expired. Please request a new one.", "token_expired");
        if (token.FailedAttempts >= _auth.MaxVerificationAttempts)
            throw new ValidationAppException("code", "Too many incorrect attempts. Please request a new code.", "token_locked");

        if (!SecureTokens.HashMatches(InputNormalizer.Text(request.Code), token.TokenHash))
        {
            token.FailedAttempts++;
            await unitOfWork.SaveChangesAsync(ct);
            throw new ValidationAppException("code", invalidMessage, "token_invalid");
        }

        token.ConsumedAt = now;
        user.EmailVerified = true;
        user.EmailVerifiedAt = now;
        user.UpdatedAt = now;
        audit.Record(AuditActions.EmailVerified, nameof(User), user.Id, userId: user.Id);
        await unitOfWork.SaveChangesAsync(ct);
    }

    public async Task ResendVerificationAsync(string email, CancellationToken ct = default)
    {
        // Always behaves the same from the caller's point of view, so it cannot be used to discover accounts.
        var user = await users.FindByEmailAsync(InputNormalizer.Email(email), ct);
        if (user is null || user.EmailVerified)
            return;

        var now = clock.UtcNow;
        foreach (var old in await tokens.GetUnconsumedAsync(user.Id, UserTokenPurpose.EmailVerification, ct))
            old.ConsumedAt = now;

        var code = SecureTokens.NewNumericCode();
        tokens.Add(NewVerificationToken(user.Id, code, now));
        await unitOfWork.SaveChangesAsync(ct);
        // Sent after the answer, so a real account doesn't answer slower (or fail) where an unknown email wouldn't.
        await background.EnqueueAsync((n, stop) => n.SendEmailVerificationAsync(user, code, stop), "verification code email");
    }

    private UserToken NewVerificationToken(int userId, string code, DateTime now) => new()
    {
        UserId = userId,
        Purpose = UserTokenPurpose.EmailVerification,
        TokenHash = SecureTokens.Hash(code),
        ExpiresAt = now.AddHours(_auth.EmailVerificationCodeHours),
        CreatedAt = now,
    };
}

public interface IAuthService
{
    Task<User> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<User?> GetValidSessionUserAsync(int userId, string securityStamp, CancellationToken ct = default);
}

/// <summary>Authenticates users, with account lockout after repeated failures (Ref 8.3).</summary>
public sealed class AuthService(
    IUserRepository users,
    IUnitOfWork unitOfWork,
    IPasswordHasher hasher,
    IAuditLogger audit,
    ISalonClock clock,
    IOptions<AuthOptions> authOptions) : IAuthService
{
    private const string InvalidCredentials = "Invalid username or password.";

    // Hash checked when the user does not exist, so both cases take about the same time. Made by the same hasher
    // (same bcrypt work factor) as real passwords: a cheaper dummy would make unknown usernames answer faster.
    private static string? s_dummyHash;

    private readonly AuthOptions _options = authOptions.Value;

    public async Task<User> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var identifier = InputNormalizer.Text(request.UsernameOrEmail);
        var user = await users.FindByUsernameOrEmailAsync(identifier, ct);
        if (user is null)
        {
            hasher.Verify(request.Password, s_dummyHash ??= hasher.Hash("not-a-real-password-1"));
            throw new UnauthorizedAppException(InvalidCredentials, "invalid_credentials");
        }

        IAuthenticatable account = user;
        var now = clock.UtcNow;
        if (account.IsLockedOut(now))
            throw new AccountLockedException(account.LockoutEndUtc!.Value);

        if (!hasher.Verify(request.Password, account.PasswordHash))
        {
            var lockedNow = account.RegisterFailedLogin(now, _options.MaxFailedLoginAttempts, TimeSpan.FromMinutes(_options.LockoutMinutes));
            audit.Record(lockedNow ? AuditActions.AccountLocked : AuditActions.LoginFailed, nameof(User), user.Id, userId: user.Id);
            await unitOfWork.SaveChangesAsync(ct);

            if (lockedNow)
                throw new AccountLockedException(account.LockoutEndUtc!.Value);
            throw new UnauthorizedAppException(InvalidCredentials, "invalid_credentials");
        }

        if (!account.EmailVerified)
            throw new ForbiddenException("Please verify your email address before logging in.", "email_not_verified");

        account.RegisterSuccessfulLogin();
        audit.Record(AuditActions.LoginSucceeded, nameof(User), user.Id, userId: user.Id);
        await unitOfWork.SaveChangesAsync(ct);
        return user;
    }

    public async Task<User?> GetValidSessionUserAsync(int userId, string securityStamp, CancellationToken ct = default)
    {
        var user = await users.GetByIdAsync(userId, ct);
        return user is not null && user.SecurityStamp == securityStamp ? user : null;
    }
}

public interface IPasswordResetService
{
    Task RequestResetAsync(string email, CancellationToken ct = default);

    /// <summary>Lets the reset page tell the user straight away that a link is expired or used (Ref 1.11).</summary>
    Task ValidateTokenAsync(string token, CancellationToken ct = default);

    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default);
}

/// <summary>Forgot Password: single-use reset links that expire after 15 minutes (Ref 1.4).</summary>
public sealed class PasswordResetService(
    IUserRepository users,
    IUserTokenRepository tokens,
    IUnitOfWork unitOfWork,
    IPasswordHasher hasher,
    IBackgroundNotifications background,
    IAuditLogger audit,
    ISalonClock clock,
    IOptions<AuthOptions> authOptions,
    IOptions<FrontendOptions> frontendOptions) : IPasswordResetService
{
    public async Task RequestResetAsync(string email, CancellationToken ct = default)
    {
        // Same response whether or not the email exists, so accounts cannot be discovered.
        var user = await users.FindByEmailAsync(InputNormalizer.Email(email), ct);
        if (user is null)
            return;

        var now = clock.UtcNow;
        var token = SecureTokens.NewUrlToken();
        tokens.Add(new UserToken
        {
            UserId = user.Id,
            Purpose = UserTokenPurpose.PasswordReset,
            TokenHash = SecureTokens.Hash(token),
            ExpiresAt = now.AddMinutes(authOptions.Value.PasswordResetTokenMinutes),
            CreatedAt = now,
        });
        audit.Record(AuditActions.PasswordResetRequested, nameof(User), user.Id, userId: user.Id);
        await unitOfWork.SaveChangesAsync(ct);

        // The token goes after "#": browsers never send that part to a server, so it stays out of hosting logs.
        var link = $"{frontendOptions.Value.BaseUrl.TrimEnd('/')}/reset-password#token={Uri.EscapeDataString(token)}";
        // Sent after the answer, so a real account doesn't answer slower (or fail) where an unknown email wouldn't.
        await background.EnqueueAsync((n, stop) => n.SendPasswordResetAsync(user, link, stop), "password reset email");
    }

    public async Task ValidateTokenAsync(string token, CancellationToken ct = default) => await GetUsableTokenAsync(token, ct);

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        var record = await GetUsableTokenAsync(request.Token, ct);
        var now = clock.UtcNow;

        var user = await users.GetByIdAsync(record.UserId, ct)
                   ?? throw new ValidationAppException("token", "This password reset link is invalid or has already been used.", "token_invalid");

        // A new security stamp also signs the user out of every existing session.
        user.ChangePassword(hasher.Hash(request.NewPassword));
        user.UpdatedAt = now;

        // This link and every other outstanding link stop working once the password changes.
        foreach (var token in await tokens.GetUnconsumedAsync(user.Id, UserTokenPurpose.PasswordReset, ct))
            token.ConsumedAt = now;

        audit.Record(AuditActions.PasswordReset, nameof(User), user.Id, userId: user.Id);
        await unitOfWork.SaveChangesAsync(ct);
    }

    private async Task<UserToken> GetUsableTokenAsync(string? token, CancellationToken ct)
    {
        var record = await tokens.FindByHashAsync(UserTokenPurpose.PasswordReset, SecureTokens.Hash(InputNormalizer.Text(token)), ct);
        if (record is null || record.ConsumedAt is not null)
            throw new ValidationAppException("token", "This password reset link is invalid or has already been used.", "token_invalid");
        if (record.IsExpired(clock.UtcNow))
            throw new ValidationAppException("token", "This password reset link has expired. Please request a new one.", "token_expired");
        return record;
    }
}
