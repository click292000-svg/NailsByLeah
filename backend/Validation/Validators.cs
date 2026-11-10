using FluentValidation;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Validation;

// Request validators. They only compose the shared rules from ValidationRules.cs.

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.FirstName).PersonName("First Name");
        RuleFor(x => x.LastName).PersonName("Last Name");
        RuleFor(x => x.Username).Username();
        RuleFor(x => x.Email).EmailAddressRule();
        RuleFor(x => x.PhoneNumber).PhoneNumber();
        RuleFor(x => x.Password).Password();
        RuleFor(x => x.ConfirmPassword).Equal(x => x.Password).WithMessage("Passwords do not match.");
        RuleFor(x => x.AcceptTerms).Equal(true).WithMessage("You must accept the Terms & Conditions to register.");
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.FirstName).PersonName("First Name");
        RuleFor(x => x.LastName).PersonName("Last Name");
        RuleFor(x => x.PhoneNumber).PhoneNumber();
    }
}

public sealed class ClientSearchRequestValidator : AbstractValidator<ClientSearchRequest>
{
    public ClientSearchRequestValidator() =>
        RuleFor(x => x.Search).MaximumLength(InputLimits.EmailMaxLength).WithMessage("The search is too long.");
}

public sealed class VerifyEmailRequestValidator : AbstractValidator<VerifyEmailRequest>
{
    public VerifyEmailRequestValidator()
    {
        RuleFor(x => x.Email).EmailAddressRule();
        RuleFor(x => x.Code).Matches("^\\s*[0-9]{6}\\s*$").WithMessage("Enter the 6-digit code from your email.");
    }
}

public sealed class EmailRequestValidator : AbstractValidator<EmailRequest>
{
    public EmailRequestValidator() => RuleFor(x => x.Email).EmailAddressRule();
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.UsernameOrEmail).NotEmpty().WithMessage("Username or email is required.");
        RuleFor(x => x.Password).NotEmpty().WithMessage("Password is required.");
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty().WithMessage("The reset link is missing its token.");
        RuleFor(x => x.NewPassword).Password();
    }
}

public sealed class AddOnSelectionValidator : AbstractValidator<AddOnSelection>
{
    public const string HandRequiredMessage = "Choose the left hand, the right hand or both hands for each add-on.";

    public AddOnSelectionValidator(bool requireHand = false)
    {
        RuleFor(x => x.AddOnId).GreaterThan(0).WithMessage("Select a valid add-on.");
        RuleFor(x => x.NailCount).InclusiveBetween(1, StoneAddOn.MaxNails)
            .WithMessage($"Number of nails must be between 1 and {StoneAddOn.MaxNails}.");
        RuleFor(x => x.Hand).NotNull().When(_ => requireHand).WithMessage(HandRequiredMessage);
        RuleFor(x => x.Hand).IsInEnum().When(x => x.Hand is not null).WithMessage(HandRequiredMessage);
        RuleFor(x => x.NailCount).Must((x, count) => x.Hand is not { } hand || StoneAddOn.FitsOn(hand, count))
            .WithMessage($"One hand has {StoneAddOn.MaxNailsPerHand} nails. Choose both hands for more.");
    }
}

public sealed class CreateBookingRequestValidator : AbstractValidator<CreateBookingRequest>
{
    private static bool BeDistinct(IReadOnlyList<AddOnSelection>? addOns) =>
        addOns is null || addOns.Select(a => a.AddOnId).Distinct().Count() == addOns.Count;

    public const string DepositAcknowledgementMessage = "You must acknowledge that the booking deposit is non-refundable.";
    public const string TermsMessage = "Please read and agree to the booking policy and Terms & Conditions.";

    public CreateBookingRequestValidator()
    {
        RuleFor(x => x.ServiceId).GreaterThan(0).WithMessage("Select a service.");
        RuleForEach(x => x.AddOns).SetValidator(new AddOnSelectionValidator(requireHand: true));
        RuleFor(x => x.AddOns).Must(BeDistinct).WithMessage("Each add-on can only be selected once.");
        RuleFor(x => x.BookingDate).NotEmpty().WithMessage("Select a booking date.");
        RuleFor(x => x.Note).MaximumLength(InputLimits.NoteMaxLength)
            .WithMessage($"Your note must be {InputLimits.NoteMaxLength} characters or fewer.");
        RuleFor(x => x.PaymentMethod).IsInEnum().WithMessage("Select GCash or Maya.");
        RuleFor(x => x.PaymentOption).IsInEnum().WithMessage("Choose to pay the deposit or the full amount.");
        RuleFor(x => x.DepositAcknowledged).Equal(true).WithMessage(DepositAcknowledgementMessage);
        RuleFor(x => x.TermsVersion).NotEmpty().WithMessage(TermsMessage);
        RuleFor(x => x.RemovalServiceId).GreaterThan(0).When(x => x.RemovalServiceId is not null).WithMessage("Select a removal.");
        RuleFor(x => x.NailColor).MaximumLength(InputLimits.NailColorMaxLength).WithMessage("Choose one of the listed colours.");
        RuleFor(x => x.IdempotencyKey).NotEmpty().WithMessage("A payment request key is required.");
        RuleFor(x => x.ReferenceImageIds)
            .Must(ids => ids is null || ids.Count <= UploadLimits.ReferenceImagesPerBooking)
            .WithMessage($"You can add up to {UploadLimits.ReferenceImagesPerBooking} reference photos per booking.")
            .Must(ids => ids is null || ids.Distinct().Count() == ids.Count)
            .WithMessage("Each reference photo can only be added once.");
    }
}

public sealed class RescheduleRequestValidator : AbstractValidator<RescheduleRequest>
{
    public RescheduleRequestValidator() => RuleFor(x => x.BookingDate).NotEmpty().WithMessage("Select a new date.");
}

public sealed class ClientCancelRequestValidator : AbstractValidator<ClientCancelRequest>
{
    public const string ExplanationRequired = "Please tell us the reason.";

    public ClientCancelRequestValidator()
    {
        RuleFor(x => x.Reason).IsInEnum().WithMessage("Select a cancellation reason.");
        RuleFor(x => x.Explanation).Must(e => !string.IsNullOrWhiteSpace(e)).When(x => x.Reason == ClientCancellationReason.Others)
            .WithMessage(ExplanationRequired);
        RuleFor(x => x.Explanation).MaximumLength(InputLimits.ExplanationMaxLength)
            .WithMessage($"Your reason must be {InputLimits.ExplanationMaxLength} characters or fewer.");
    }
}

public sealed class AdminCancelRequestValidator : AbstractValidator<AdminCancelRequest>
{
    public AdminCancelRequestValidator()
    {
        RuleFor(x => x.Reason).IsInEnum().WithMessage("Select a cancellation reason.");
        // The explanation is optional (Ref 3.2); only its length is limited.
        RuleFor(x => x.Explanation).MaximumLength(InputLimits.ExplanationMaxLength)
            .WithMessage($"Explanation must be {InputLimits.ExplanationMaxLength} characters or fewer.");
    }
}

public sealed class CreateServiceRequestValidator : AbstractValidator<CreateServiceRequest>
{
    public CreateServiceRequestValidator()
    {
        RuleFor(x => x.Category).Must(CatalogServiceFactory.IsKnownCategory)
            .WithMessage($"Category must be one of: {string.Join(", ", CatalogServiceFactory.Categories)}.");
        RuleFor(x => x.Name).ServiceName();
        RuleFor(x => x.Price).PriceRule();
        RuleFor(x => x.DurationMinutes).DurationRule();
    }
}

public sealed class CreateAddOnRequestValidator : AbstractValidator<CreateAddOnRequest>
{
    public CreateAddOnRequestValidator()
    {
        RuleFor(x => x.Name).ServiceName();
        RuleFor(x => x.Price).PriceRule();
    }
}

public sealed class UpdateServiceRequestValidator : AbstractValidator<UpdateServiceRequest>
{
    public UpdateServiceRequestValidator()
    {
        RuleFor(x => x.Name).ServiceName();
        RuleFor(x => x.Price).PriceRule();
        RuleFor(x => x.DurationMinutes!.Value).DurationRule().When(x => x.DurationMinutes is not null)
            .OverridePropertyName(nameof(UpdateServiceRequest.DurationMinutes));
    }
}

public sealed class BlockSlotRequestValidator : AbstractValidator<BlockSlotRequest>
{
    public BlockSlotRequestValidator()
    {
        RuleFor(x => x.Date).NotEmpty().WithMessage("Select a date to block.");
        RuleFor(x => x.StartTime).NotNull().When(x => x.EndTime is not null).WithMessage("Choose when the blocked period starts.");
        RuleFor(x => x.EndTime).Must((x, end) => end is null || x.StartTime is null || end > x.StartTime)
            .WithMessage("The end time must be after the start time.");
        RuleFor(x => x.Reason).MaximumLength(InputLimits.BlockReasonMaxLength)
            .WithMessage($"Reason must be {InputLimits.BlockReasonMaxLength} characters or fewer.");
    }
}

public sealed class SubmitFeedbackRequestValidator : AbstractValidator<SubmitFeedbackRequest>
{
    public SubmitFeedbackRequestValidator()
    {
        RuleFor(x => x.Rating).InclusiveBetween(Feedback.MinRating, Feedback.MaxRating).WithMessage("Choose a rating from 1 to 5 stars.");
        // The comment is optional; only its length is limited.
        RuleFor(x => x.Comment).MaximumLength(InputLimits.FeedbackCommentMaxLength)
            .WithMessage($"Comments must be {InputLimits.FeedbackCommentMaxLength} characters or fewer.");
        RuleFor(x => x.SubmissionKey).NotEmpty().WithMessage("A submission key is required.");
    }
}

public sealed class UpdateSalonHoursRequestValidator : AbstractValidator<UpdateSalonHoursRequest>
{
    public UpdateSalonHoursRequestValidator() =>
        RuleFor(x => x.ClosingTime).NotEmpty().WithMessage("Choose a closing time.");
}
