namespace NailsByLeah.Api.Domain;

public class User : IAuthenticatable, ISoftDeletable
{
    public int Id { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Username { get; set; } = "";
    public string Email { get; set; } = "";
    public string PhoneNumber { get; set; } = "";

    /// <summary>bcrypt hash. Plain-text passwords are never stored (Ref 8.1).</summary>
    public string PasswordHash { get; set; } = "";

    public UserRole Role { get; set; } = UserRole.Client;

    public bool EmailVerified { get; set; }
    public DateTime? EmailVerifiedAt { get; set; }

    /// <summary>Version and time of the Terms &amp; Conditions the user accepted (Ref 9.4).</summary>
    public string? TermsVersion { get; set; }
    public DateTime? TermsAcceptedAt { get; set; }

    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEndUtc { get; set; }

    /// <summary>Changes whenever credentials change, which invalidates existing sessions.</summary>
    public string SecurityStamp { get; set; } = NewSecurityStamp();

    /// <summary>The client's own photo, in the same private storage as design photos. Seen by the client and administrators.</summary>
    public string? PhotoFileName { get; set; }
    public string? PhotoContentType { get; set; }

    /// <summary>Leyah's private note about the client ("prefers short almond"); never shown to the client.</summary>
    public string? AdminNote { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }

    public static string NewSecurityStamp() => Guid.NewGuid().ToString("N");

    public bool IsLockedOut(DateTime utcNow) => LockoutEndUtc is { } end && end > utcNow;

    public bool RegisterFailedLogin(DateTime utcNow, int maxAttempts, TimeSpan lockoutDuration)
    {
        FailedLoginCount++;
        if (FailedLoginCount < maxAttempts)
            return false;

        LockoutEndUtc = utcNow.Add(lockoutDuration);
        FailedLoginCount = 0;
        return true;
    }

    public void RegisterSuccessfulLogin()
    {
        FailedLoginCount = 0;
        LockoutEndUtc = null;
    }

    /// <summary>Signs out every session: each one carries the old stamp and is refused from now on.</summary>
    public void RenewSecurityStamp() => SecurityStamp = NewSecurityStamp();

    public void ChangePassword(string newPasswordHash)
    {
        PasswordHash = newPasswordHash;
        SecurityStamp = NewSecurityStamp();
        FailedLoginCount = 0;
        LockoutEndUtc = null;
    }
}
