using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>Test 9.1.2: input validation rules.</summary>
public sealed class ValidationRulesTests
{
    private readonly RegisterRequestValidator _validator = new();

    private static RegisterRequest Valid() =>
        new("Leyah", "Santos", "leah", "leah@test.local", "09171234567", "Password1", "Password1", AcceptTerms: true);

    [Fact]
    public void A_complete_registration_is_valid() => Assert.True(_validator.Validate(Valid()).IsValid);

    [Theory]
    [InlineData(75, true)]
    [InlineData(76, false)]
    public void Names_are_limited_to_75_characters(int length, bool valid)
    {
        var request = Valid() with { FirstName = new string('a', length), LastName = new string('b', length) };
        Assert.Equal(valid, _validator.Validate(request).IsValid);
    }

    [Theory]
    [InlineData("José-María #2")]
    [InlineData("O'Brien & Co.")]
    [InlineData("<script>alert(1)</script>")]
    public void Names_accept_letters_numbers_and_special_characters(string name) =>
        Assert.True(_validator.Validate(Valid() with { FirstName = name }).IsValid);

    [Fact]
    public void Blank_names_are_rejected() => Assert.False(_validator.Validate(Valid() with { FirstName = "   " }).IsValid);

    [Theory]
    [InlineData("09171234567", null)]
    [InlineData("", PhoneRule.Required)]
    [InlineData("abc#", PhoneRule.DigitsOnly)]
    [InlineData("0917123456a", PhoneRule.DigitsOnly)]
    [InlineData("0917-123-4567", PhoneRule.DigitsOnly)]
    [InlineData("0917 123 4567", PhoneRule.DigitsOnly)]
    [InlineData("+639171234567", PhoneRule.DigitsOnly)]
    [InlineData("0917123456", PhoneRule.TooShort)]
    [InlineData("091712345678", PhoneRule.TooLong)]
    public void Phone_numbers_must_be_exactly_11_digits(string phone, string? expectedMessage)
    {
        var errors = _validator.Validate(Valid() with { PhoneNumber = phone }).Errors
            .Where(e => e.PropertyName == nameof(RegisterRequest.PhoneNumber)).Select(e => e.ErrorMessage).ToList();
        Assert.Equal(expectedMessage is null ? [] : [expectedMessage], errors);
    }

    [Fact]
    public void Non_digits_are_stripped_from_phone_numbers() =>
        Assert.Equal("09171234567", InputNormalizer.DigitsOnly("(0917) 123-4567 abc#"));

    [Theory]
    [InlineData("Password1", true)]
    [InlineData("abcdefg1", true)]
    [InlineData("Pass1", false)]
    [InlineData("passwordonly", false)]
    [InlineData("1234567890", false)]
    public void Passwords_need_8_characters_with_a_letter_and_a_number(string password, bool valid) =>
        Assert.Equal(valid, PasswordPolicy.IsSatisfiedBy(password));

    [Fact]
    public void Passwords_longer_than_bcrypt_can_use_are_rejected() =>
        Assert.False(PasswordPolicy.IsSatisfiedBy(new string('a', 72) + "1"));

    [Fact]
    public void Confirm_password_must_match() =>
        Assert.False(_validator.Validate(Valid() with { ConfirmPassword = "Different1" }).IsValid);

    [Fact]
    public void Terms_must_be_accepted() =>
        Assert.False(_validator.Validate(Valid() with { AcceptTerms = false }).IsValid);

    [Fact]
    public void Booking_requires_the_deposit_acknowledgment()
    {
        var request = new CreateBookingRequest(1, null, new DateOnly(2026, 12, 1), new TimeOnly(10, 0),
            Domain.PaymentMethod.GCash, DepositAcknowledged: false, Guid.NewGuid());

        var result = new CreateBookingRequestValidator().Validate(request);

        Assert.Contains(result.Errors, e => e.ErrorMessage == CreateBookingRequestValidator.DepositAcknowledgementMessage);
    }

    [Fact]
    public void Administrator_cancellation_explanation_is_optional() =>
        Assert.True(new AdminCancelRequestValidator().Validate(new AdminCancelRequest(Domain.AdminCancellationReason.Emergency, null)).IsValid);
}
