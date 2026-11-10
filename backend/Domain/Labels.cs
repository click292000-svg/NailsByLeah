namespace NailsByLeah.Api.Domain;

/// <summary>Human-readable labels for enum values shown in dropdowns and receipts.</summary>
public static class Labels
{
    /// <summary>Common notes for Leyah, offered as one-tap additions to the typed note when booking.</summary>
    public static readonly IReadOnlyList<string> NoteSuggestions =
    [
        "This is my first visit",
        "I'll bring a reference photo",
        "Please keep my nails short",
        "I'd like long nails",
        "I have sensitive skin or allergies",
    ];

    public const string NoNote = "No note";

    public static readonly IReadOnlyDictionary<ClientCancellationReason, string> ClientCancellationReasons = new Dictionary<ClientCancellationReason, string>
    {
        [ClientCancellationReason.ChangeOfSchedule] = "Change of schedule",
        [ClientCancellationReason.Emergency] = "Emergency",
        [ClientCancellationReason.BookedByMistake] = "Booked by mistake",
        [ClientCancellationReason.FoundAnotherProvider] = "Found another provider",
        [ClientCancellationReason.Others] = "Others",
    };

    public static readonly IReadOnlyDictionary<AdminCancellationReason, string> AdminCancellationReasons = new Dictionary<AdminCancellationReason, string>
    {
        [AdminCancellationReason.StaffUnavailable] = "Leyah is not available",
        [AdminCancellationReason.ScheduleConflict] = "Schedule conflict",
        [AdminCancellationReason.Emergency] = "Emergency",
        [AdminCancellationReason.ClientDidNotRespond] = "Client did not respond",
        [AdminCancellationReason.Others] = "Others",
    };

    public static readonly IReadOnlyDictionary<NailHand, string> Hands = new Dictionary<NailHand, string>
    {
        [NailHand.Left] = "Left hand",
        [NailHand.Right] = "Right hand",
        [NailHand.Both] = "Both hands",
    };

    public static readonly IReadOnlyDictionary<PaymentOption, string> PaymentOptions = new Dictionary<PaymentOption, string>
    {
        [PaymentOption.Deposit] = "Booking deposit",
        [PaymentOption.Full] = "Full payment",
    };

    public static string For(PaymentOption option) => PaymentOptions[option];

    public static string For(NailHand hand) => Hands[hand];

    /// <summary>Resolves a stored cancellation reason (an enum member name) to its label.</summary>
    public static string ForCancellationReason(string reason)
    {
        if (Enum.TryParse<ClientCancellationReason>(reason, out var client))
            return ClientCancellationReasons[client];
        if (Enum.TryParse<AdminCancellationReason>(reason, out var admin))
            return AdminCancellationReasons[admin];
        return reason;
    }
}
