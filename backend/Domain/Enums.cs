namespace NailsByLeah.Api.Domain;

/// <summary>Role names used in authorization attributes. They match <see cref="UserRole"/> member names.</summary>
public static class Roles
{
    public const string Client = nameof(UserRole.Client);
    public const string Administrator = nameof(UserRole.Administrator);
}

public enum UserRole
{
    Client,
    Administrator,
}

public enum BookingStatus
{
    Pending,
    Confirmed,
    Completed,
    Cancelled,
}

public enum PaymentMethod
{
    GCash,
    Maya,
}

/// <summary>What the client chose to pay when booking. The deposit is part of a full payment, never charged on top.</summary>
public enum PaymentOption
{
    Deposit,
    Full,
}

public enum PaymentStatus
{
    Succeeded,
    Failed,
}

/// <summary>Reasons a client may give when cancelling (Ref 2.5).</summary>
public enum ClientCancellationReason
{
    ChangeOfSchedule,
    Emergency,
    BookedByMistake,
    FoundAnotherProvider,
    Others,
}

/// <summary>Reasons an administrator may give when cancelling (Ref 3.1).</summary>
public enum AdminCancellationReason
{
    StaffUnavailable,
    ScheduleConflict,
    Emergency,
    ClientDidNotRespond,
    Others,
}

/// <summary>Which hand a Stone add-on goes on. One hand has five nails, so Left or Right allows at most 5.</summary>
public enum NailHand
{
    Left,
    Right,
    Both,
}

public enum UserTokenPurpose
{
    EmailVerification,
    PasswordReset,
}
