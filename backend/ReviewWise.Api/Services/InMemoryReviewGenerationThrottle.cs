using System.Collections.Concurrent;

namespace ReviewWise.Api.Services;

public class InMemoryReviewGenerationThrottle : IReviewGenerationThrottle
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _attempts = new();

    public ReviewGenerationThrottleDecision CheckAndTrack(string key, TimeSpan cooldown, DateTimeOffset now)
    {
        if (cooldown <= TimeSpan.Zero)
        {
            _attempts[key] = now;
            return new ReviewGenerationThrottleDecision(true, null);
        }

        if (_attempts.TryGetValue(key, out var lastAttemptAt))
        {
            var elapsed = now - lastAttemptAt;
            if (elapsed < cooldown)
            {
                var retryAfterSeconds = Math.Max(1, (int)Math.Ceiling((cooldown - elapsed).TotalSeconds));
                return new ReviewGenerationThrottleDecision(false, retryAfterSeconds);
            }
        }

        _attempts[key] = now;
        return new ReviewGenerationThrottleDecision(true, null);
    }
}
