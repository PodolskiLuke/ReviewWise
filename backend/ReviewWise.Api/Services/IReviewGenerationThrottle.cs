namespace ReviewWise.Api.Services;

public readonly record struct ReviewGenerationThrottleDecision(bool IsAllowed, int? RetryAfterSeconds);

public interface IReviewGenerationThrottle
{
    ReviewGenerationThrottleDecision CheckAndTrack(string key, TimeSpan cooldown, DateTimeOffset now);
}
