namespace NailsByLeah.Api.Domain;

/// <summary>Salon-wide settings administrators change in the app. There is exactly one row (id 1).</summary>
public class SalonSettings
{
    public const int SingletonId = 1;
    public static readonly TimeOnly DefaultClosingTime = new(21, 0);

    public int Id { get; set; } = SingletonId;

    /// <summary>Every appointment must be finished by this time.</summary>
    public TimeOnly ClosingTime { get; set; } = DefaultClosingTime;

    public DateTime UpdatedAt { get; set; }
    public int? UpdatedByUserId { get; set; }
}

/// <summary>
/// A period of the day in minutes since midnight. Minutes are used instead of <see cref="TimeOnly"/>
/// arithmetic, which wraps around at midnight.
/// </summary>
public readonly record struct DayPeriod(int Start, int End)
{
    public static int ToMinutes(TimeOnly time) => time.Hour * 60 + time.Minute;

    public static DayPeriod From(TimeOnly start, int minutes) => new(ToMinutes(start), ToMinutes(start) + minutes);

    public static DayPeriod Between(TimeOnly start, TimeOnly end) => new(ToMinutes(start), ToMinutes(end));

    public bool Overlaps(DayPeriod other) => Start < other.End && other.Start < End;

    public bool Contains(int minute) => Start <= minute && minute < End;

    /// <summary>
    /// The time an appointment keeps to itself: its service plus the mandatory gap after it.
    /// Two appointments clash when these overlap, so the next one can start at the earliest
    /// <paramref name="bufferMinutes"/> after the previous one's scheduled end.
    /// </summary>
    public static DayPeriod Occupied(TimeOnly start, int durationMinutes, int bufferMinutes) =>
        From(start, durationMinutes + bufferMinutes);
}
