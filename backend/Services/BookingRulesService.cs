using System.Text.Json;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>The booking rules in force: Leyah's own values where she set them, otherwise the defaults from appsettings.</summary>
public sealed record BookingRules(
    decimal DepositAmount, int RescheduleMinimumHours, int RescheduleLimit, int MaxDaysAhead,
    IReadOnlyList<string> NailColors, IReadOnlyList<string> OutOfStockColors)
{
    public bool IsOutOfStock(string color) => OutOfStockColors.Contains(color, StringComparer.OrdinalIgnoreCase);
}

public interface IBookingRulesService
{
    Task<BookingRules> GetAsync(CancellationToken ct = default);
    Task<BookingRulesResponse> GetSettingsAsync(CancellationToken ct = default);
    Task<BookingRulesResponse> UpdateAsync(int adminId, UpdateBookingRulesRequest request, CancellationToken ct = default);
    Task<BookingRulesResponse> SetColorStockAsync(int adminId, ColorStockRequest request, CancellationToken ct = default);
}

/// <summary>
/// The deposit, the reschedule rules, how far ahead clients can book, and which chart shades are out of stock. They live
/// on the single salon_settings row so Leyah can change them in the app; an empty value means the appsettings default.
/// </summary>
public sealed class BookingRulesService(
    ISalonSettingsRepository settings,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IOptions<BookingOptions> bookingOptions,
    IOptions<ScheduleOptions> scheduleOptions) : IBookingRulesService
{
    public const int DefaultRescheduleLimit = 2;
    public const int MaxRescheduleLimit = 10;
    public const int MaxRescheduleMinimumHours = 168; // a week
    public const int MinDaysAhead = 7;
    public const int MaxDaysAheadLimit = 365;

    public async Task<BookingRules> GetAsync(CancellationToken ct = default) => From(await settings.GetAsync(ct));

    public async Task<BookingRulesResponse> GetSettingsAsync(CancellationToken ct = default) => ToResponse(await GetAsync(ct));

    public async Task<BookingRulesResponse> UpdateAsync(int adminId, UpdateBookingRulesRequest request, CancellationToken ct = default)
    {
        if (request.DepositAmount < 0 || request.DepositAmount > InputLimits.MaxPrice)
            throw new ValidationAppException("depositAmount", $"The deposit must be between PHP 0 and {InputLimits.MaxPrice:0}.");
        if (decimal.Round(request.DepositAmount, 2) != request.DepositAmount)
            throw new ValidationAppException("depositAmount", "The deposit can have at most 2 decimal places.");
        if (request.RescheduleMinimumHours is < 0 or > MaxRescheduleMinimumHours)
            throw new ValidationAppException("rescheduleMinimumHours", $"Choose between 0 and {MaxRescheduleMinimumHours} hours.");
        if (request.RescheduleLimit is < 0 or > MaxRescheduleLimit)
            throw new ValidationAppException("rescheduleLimit", $"Choose between 0 and {MaxRescheduleLimit} times.");
        if (request.MaxDaysAhead < MinDaysAhead || request.MaxDaysAhead > MaxDaysAheadLimit)
            throw new ValidationAppException("maxDaysAhead", $"Choose between {MinDaysAhead} and {MaxDaysAheadLimit} days.");

        var row = await settings.GetAsync(ct);
        var before = From(row);
        row.DepositAmount = request.DepositAmount;
        row.RescheduleMinimumHours = request.RescheduleMinimumHours;
        row.ClientRescheduleLimit = request.RescheduleLimit;
        row.MaxDaysAhead = request.MaxDaysAhead;
        Touch(row, adminId);
        audit.Record(AuditActions.BookingRulesChanged, nameof(SalonSettings), row.Id,
            $"Deposit PHP {before.DepositAmount:0.00} -> {request.DepositAmount:0.00}; reschedule {before.RescheduleMinimumHours} h before -> {request.RescheduleMinimumHours} h, "
            + $"up to {before.RescheduleLimit} -> {request.RescheduleLimit} times; book up to {before.MaxDaysAhead} -> {request.MaxDaysAhead} days ahead");
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(From(row));
    }

    public async Task<BookingRulesResponse> SetColorStockAsync(int adminId, ColorStockRequest request, CancellationToken ct = default)
    {
        var listed = bookingOptions.Value.NailColors
            .FirstOrDefault(c => string.Equals(c, request.Color?.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw new ValidationAppException("color", "Choose one of the colours on the chart.");

        var row = await settings.GetAsync(ct);
        var outOfStock = ReadColors(row.OutOfStockColors).Where(c => !string.Equals(c, listed, StringComparison.OrdinalIgnoreCase)).ToList();
        if (!request.InStock)
            outOfStock.Add(listed);
        row.OutOfStockColors = outOfStock.Count == 0 ? null : JsonSerializer.Serialize(outOfStock);
        Touch(row, adminId);
        audit.Record(AuditActions.ColorStockChanged, nameof(SalonSettings), row.Id, $"{listed} {(request.InStock ? "back in stock" : "out of stock")}");
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(From(row));
    }

    private BookingRules From(SalonSettings row)
    {
        var colors = bookingOptions.Value.NailColors;
        // Only shades still on the chart count, in the chart's order.
        var outOfStock = ReadColors(row.OutOfStockColors);
        return new BookingRules(
            row.DepositAmount ?? bookingOptions.Value.DepositAmount,
            row.RescheduleMinimumHours ?? bookingOptions.Value.RescheduleMinimumHours,
            row.ClientRescheduleLimit ?? DefaultRescheduleLimit,
            row.MaxDaysAhead ?? scheduleOptions.Value.MaxDaysAhead,
            colors,
            colors.Where(c => outOfStock.Contains(c, StringComparer.OrdinalIgnoreCase)).ToList());
    }

    private static List<string> ReadColors(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static BookingRulesResponse ToResponse(BookingRules r) =>
        new(r.DepositAmount, r.RescheduleMinimumHours, r.RescheduleLimit, r.MaxDaysAhead, r.OutOfStockColors);

    private void Touch(SalonSettings row, int adminId)
    {
        row.UpdatedAt = clock.UtcNow;
        row.UpdatedByUserId = adminId;
    }
}
