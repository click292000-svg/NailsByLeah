using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>Private storage for uploaded reference photos: Supabase Storage when configured, otherwise this computer's disk.</summary>
public interface IReferenceImageStore
{
    /// <summary>Saves the bytes under a new random name and returns that name.</summary>
    Task<string> SaveAsync(ReadOnlyMemory<byte> content, string extension, CancellationToken ct = default);

    /// <summary>Opens a stored file for reading, or returns null when it no longer exists.</summary>
    Task<Stream?> OpenReadAsync(string storedFileName, CancellationToken ct = default);

    /// <summary>Removes a stored file. A file that is already gone is not an error.</summary>
    Task DeleteAsync(string storedFileName, CancellationToken ct = default);
}

/// <summary>Stored names are random (never the client's file name), so they cannot be guessed or used to reach other files.</summary>
public static class ReferenceImageFileName
{
    public static string New(string extension) => $"{Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant()}{extension}";

    public static string ContentTypeFor(string extension) => extension switch
    {
        ".jpg" => ImageSignature.Jpeg.ContentType,
        ".png" => ImageSignature.Png.ContentType,
        ".webp" => ImageSignature.Webp.ContentType,
        _ => "application/octet-stream",
    };
}

/// <summary>
/// Stores files on the server's disk, outside the web root. Names are random (never the client's
/// file name), so paths cannot be guessed or used to escape the folder.
/// </summary>
public sealed class FileSystemReferenceImageStore : IReferenceImageStore
{
    private readonly string _root;

    public FileSystemReferenceImageStore(IOptions<UploadOptions> options, IHostEnvironment environment)
    {
        _root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, options.Value.ReferenceImagePath));
        Directory.CreateDirectory(_root);
    }

    public async Task<string> SaveAsync(ReadOnlyMemory<byte> content, string extension, CancellationToken ct = default)
    {
        var name = ReferenceImageFileName.New(extension);
        await using var file = new FileStream(PathFor(name), FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await file.WriteAsync(content, ct);
        return name;
    }

    public Task<Stream?> OpenReadAsync(string storedFileName, CancellationToken ct = default)
    {
        var path = PathFor(storedFileName);
        return Task.FromResult<Stream?>(File.Exists(path) ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read) : null);
    }

    public Task DeleteAsync(string storedFileName, CancellationToken ct = default)
    {
        var path = PathFor(storedFileName);
        if (File.Exists(path))
            File.Delete(path);
        return Task.CompletedTask;
    }

    private string PathFor(string storedFileName)
    {
        // Stored names are generated above; this guard only stops a corrupted row from reaching outside the folder.
        var path = Path.GetFullPath(Path.Combine(_root, Path.GetFileName(storedFileName)));
        if (!path.StartsWith(_root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid stored file name.");
        return path;
    }
}

/// <summary>Recognises JPEG, PNG and WebP from their first bytes, so a renamed file of another type is refused.</summary>
public static class ImageSignature
{
    public sealed record Format(string ContentType, string Extension);

    public static readonly Format Jpeg = new("image/jpeg", ".jpg");
    public static readonly Format Png = new("image/png", ".png");
    public static readonly Format Webp = new("image/webp", ".webp");

    public static Format? Detect(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
            return Jpeg;
        if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
            return Png;
        if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8))
            return Webp;
        return null;
    }
}
