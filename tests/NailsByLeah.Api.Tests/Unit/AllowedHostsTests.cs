using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>The live site refuses to start unless AllowedHosts names its real address.</summary>
public sealed class AllowedHostsTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("*")]
    [InlineData("*.onrender.com")]
    [InlineData("nailsbyleyah.onrender.com;*")]
    [InlineData("localhost;127.0.0.1;[::1]")]
    public void Wildcards_and_local_addresses_are_not_enough_for_the_live_site(string? allowedHosts) =>
        Assert.NotNull(StartupTasks.AllowedHostsProblem(allowedHosts));

    [Theory]
    [InlineData("nailsbyleyah.onrender.com")]
    [InlineData("nailsbyleyah.com;www.nailsbyleyah.com")]
    public void Real_addresses_are_accepted(string allowedHosts) =>
        Assert.Null(StartupTasks.AllowedHostsProblem(allowedHosts));
}
