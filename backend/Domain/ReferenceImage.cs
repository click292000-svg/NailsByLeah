namespace NailsByLeah.Api.Domain;

/// <summary>
/// A photo of the nail design a client wants. It is uploaded while booking (BookingId still null, so it
/// survives going back and forth between steps or resuming a saved draft) and is attached to the booking
/// when the booking is created. The file itself lives in private storage under a random name; only the
/// owning client and administrators can download it.
/// </summary>
public class ReferenceImage : ISoftDeletable
{
    public int Id { get; set; }

    public int ClientId { get; set; }
    public User Client { get; set; } = null!;

    public int? BookingId { get; set; }
    public Booking? Booking { get; set; }

    /// <summary>Random file name in the image store, e.g. "3f2a…e1.jpg". Never derived from the upload's own name.</summary>
    public string StoredFileName { get; set; } = "";

    /// <summary>image/jpeg, image/png or image/webp, detected from the file's content, not its name.</summary>
    public string ContentType { get; set; } = "";

    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsDeleted { get; set; }

    /// <summary>A photo of the shade in a colour request, rather than of the design.</summary>
    public bool IsColorReference { get; set; }

    public bool IsAttached => BookingId is not null;
}
