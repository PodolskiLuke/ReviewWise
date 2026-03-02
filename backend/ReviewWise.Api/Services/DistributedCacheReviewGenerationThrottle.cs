using System.Globalization;
using Microsoft.Extensions.Caching.Distributed;

namespace ReviewWise.Api.Services;

public class DistributedCacheReviewGenerationThrottle : IReviewGenerationThrottle
{
    private readonly IDistributedCache _cache;

    public DistributedCacheReviewGenerationThrottle(IDistributedCache cache)
    {
        _cache = cache;
    }

    public ReviewGenerationThrottleDecision CheckAndTrack(string key, TimeSpan cooldown, DateTimeOffset now)
    {
        if (cooldown <= TimeSpan.Zero)
        {
            _cache.SetString(key, now.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture));
            return new ReviewGenerationThrottleDecision(true, null);
        }

        var lastAttemptRaw = _cache.GetString(key);
        if (!string.IsNullOrWhiteSpace(lastAttemptRaw)
            && long.TryParse(lastAttemptRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var lastAttemptMs))
        {
            var lastAttempt = DateTimeOffset.FromUnixTimeMilliseconds(lastAttemptMs);
            var elapsed = now - lastAttempt;
            if (elapsed < cooldown)
            {
                var retryAfterSeconds = Math.Max(1, (int)Math.Ceiling((cooldown - elapsed).TotalSeconds));
                return new ReviewGenerationThrottleDecision(false, retryAfterSeconds);
            }
        }

        _cache.SetString(
            key,
            now.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = cooldown
            });

        return new ReviewGenerationThrottleDecision(true, null);
    }
}
