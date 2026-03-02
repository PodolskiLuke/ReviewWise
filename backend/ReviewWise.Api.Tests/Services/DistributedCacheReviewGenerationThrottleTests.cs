using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using ReviewWise.Api.Services;
using Xunit;

namespace ReviewWise.Api.Tests.Services;

public class DistributedCacheReviewGenerationThrottleTests
{
    [Fact]
    public void CheckAndTrack_FirstRequest_IsAllowed()
    {
        var throttle = CreateThrottle();
        var now = DateTimeOffset.UtcNow;

        var result = throttle.CheckAndTrack("key-1", TimeSpan.FromSeconds(60), now);

        Assert.True(result.IsAllowed);
        Assert.Null(result.RetryAfterSeconds);
    }

    [Fact]
    public void CheckAndTrack_SecondRequestInsideCooldown_IsDeniedWithRetryAfter()
    {
        var throttle = CreateThrottle();
        var now = DateTimeOffset.UtcNow;

        _ = throttle.CheckAndTrack("key-2", TimeSpan.FromSeconds(60), now);
        var result = throttle.CheckAndTrack("key-2", TimeSpan.FromSeconds(60), now.AddSeconds(10));

        Assert.False(result.IsAllowed);
        Assert.NotNull(result.RetryAfterSeconds);
        Assert.InRange(result.RetryAfterSeconds!.Value, 49, 50);
    }

    [Fact]
    public void CheckAndTrack_RequestAfterCooldown_IsAllowedAgain()
    {
        var throttle = CreateThrottle();
        var now = DateTimeOffset.UtcNow;

        _ = throttle.CheckAndTrack("key-3", TimeSpan.FromSeconds(1), now);
        var result = throttle.CheckAndTrack("key-3", TimeSpan.FromSeconds(1), now.AddSeconds(2));

        Assert.True(result.IsAllowed);
        Assert.Null(result.RetryAfterSeconds);
    }

    private static DistributedCacheReviewGenerationThrottle CreateThrottle()
    {
        var options = new MemoryDistributedCacheOptions();
        var cache = new MemoryDistributedCache(Options.Create(options));
        return new DistributedCacheReviewGenerationThrottle(cache);
    }
}
