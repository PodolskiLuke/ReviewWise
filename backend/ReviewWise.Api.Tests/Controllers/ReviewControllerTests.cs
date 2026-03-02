using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ReviewWise.Api.Controllers;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;
using ReviewWise.Api.Services;
using Xunit;

namespace ReviewWise.Api.Tests.Controllers;

public class ReviewControllerTests
{
    [Fact]
    public async Task ReviewPullRequest_WhenReviewAlreadyExists_ReturnsStoredReviewWithReusedTrue()
    {
        var db = CreateDbContext();
        var owner = "owner-existing";
        var repo = "repo-existing";
        var prNumber = 12;

        db.ReviewResults.Add(new ReviewResult
        {
            Owner = owner,
            Repo = repo,
            PrNumber = prNumber,
            Username = "reviewer",
            Review = "already saved review",
            CreatedAt = DateTime.UtcNow.AddMinutes(-2)
        });
        await db.SaveChangesAsync();

        var controller = CreateController(
            db,
            cooldownSeconds: 60,
            userName: "reviewer",
            throttle: new SequenceThrottle(new ReviewGenerationThrottleDecision(true, null)));

        var result = await controller.ReviewPullRequest(owner, repo, prNumber);

        var ok = Assert.IsType<OkObjectResult>(result);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        Assert.Equal("already saved review", doc.RootElement.GetProperty("review").GetString());
        Assert.True(doc.RootElement.GetProperty("reused").GetBoolean());
    }

    [Fact]
    public async Task ReviewPullRequest_WhenCalledTwiceInsideCooldown_Returns429AndRetryAfter()
    {
        var db = CreateDbContext();
        var owner = $"owner-{Guid.NewGuid():N}";
        var repo = $"repo-{Guid.NewGuid():N}";
        const int prNumber = 42;

        var controller = CreateController(
            db,
            cooldownSeconds: 60,
            userName: "cooldown-user",
            throttle: new SequenceThrottle(
                new ReviewGenerationThrottleDecision(true, null),
                new ReviewGenerationThrottleDecision(false, 42)));

        var first = await controller.ReviewPullRequest(owner, repo, prNumber);
        Assert.IsType<UnauthorizedResult>(first);

        var second = await controller.ReviewPullRequest(owner, repo, prNumber);

        var tooMany = Assert.IsType<ObjectResult>(second);
        Assert.Equal(StatusCodes.Status429TooManyRequests, tooMany.StatusCode);
        Assert.True(controller.Response.Headers.TryGetValue("Retry-After", out var retryAfterHeader));
        Assert.False(string.IsNullOrWhiteSpace(retryAfterHeader.ToString()));

        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(tooMany.Value));
        Assert.True(doc.RootElement.TryGetProperty("retryAfterSeconds", out var retryAfterSeconds));
        Assert.True(retryAfterSeconds.GetInt32() > 0);
    }

    [Fact]
    public async Task ReviewPullRequest_WhenCooldownHasElapsed_DoesNotReturn429()
    {
        var db = CreateDbContext();
        var owner = $"owner-{Guid.NewGuid():N}";
        var repo = $"repo-{Guid.NewGuid():N}";
        const int prNumber = 7;

        var controller = CreateController(
            db,
            cooldownSeconds: 1,
            userName: "elapsed-user",
            throttle: new SequenceThrottle(
                new ReviewGenerationThrottleDecision(true, null),
                new ReviewGenerationThrottleDecision(true, null)));

        var first = await controller.ReviewPullRequest(owner, repo, prNumber);
        Assert.IsType<UnauthorizedResult>(first);

        var second = await controller.ReviewPullRequest(owner, repo, prNumber);
        Assert.IsType<UnauthorizedResult>(second);
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"reviewwise-tests-{Guid.NewGuid():N}")
            .Options;

        return new AppDbContext(options);
    }

    private static ReviewController CreateController(AppDbContext db, int cooldownSeconds, string userName, IReviewGenerationThrottle? throttle = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ReviewGeneration:CooldownSeconds"] = cooldownSeconds.ToString()
            })
            .Build();

        var controller = new ReviewController(
            httpClientFactory: new NoopHttpClientFactory(),
            config: config,
            db: db,
            logger: NullLogger<ReviewController>.Instance,
            reviewGenerationThrottle: throttle ?? new InMemoryReviewGenerationThrottle());

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IAuthenticationService, FakeAuthenticationService>();
        var serviceProvider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext
        {
            RequestServices = serviceProvider,
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Name, userName),
                new Claim(ClaimTypes.AuthenticationMethod, "GitHub")
            ], "TestAuth"))
        };

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = httpContext
        };

        return controller;
    }

    private sealed class NoopHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private sealed class FakeAuthenticationService : IAuthenticationService
    {
        public Task<AuthenticateResult> AuthenticateAsync(HttpContext context, string? scheme) =>
            Task.FromResult(AuthenticateResult.NoResult());

        public Task ChallengeAsync(HttpContext context, string? scheme, AuthenticationProperties? properties) =>
            Task.CompletedTask;

        public Task ForbidAsync(HttpContext context, string? scheme, AuthenticationProperties? properties) =>
            Task.CompletedTask;

        public Task SignInAsync(HttpContext context, string? scheme, ClaimsPrincipal principal, AuthenticationProperties? properties) =>
            Task.CompletedTask;

        public Task SignOutAsync(HttpContext context, string? scheme, AuthenticationProperties? properties) =>
            Task.CompletedTask;
    }

    private sealed class SequenceThrottle : IReviewGenerationThrottle
    {
        private readonly Queue<ReviewGenerationThrottleDecision> _decisions;

        public SequenceThrottle(params ReviewGenerationThrottleDecision[] decisions)
        {
            _decisions = new Queue<ReviewGenerationThrottleDecision>(decisions);
        }

        public ReviewGenerationThrottleDecision CheckAndTrack(string key, TimeSpan cooldown, DateTimeOffset now)
        {
            if (_decisions.Count == 0)
            {
                return new ReviewGenerationThrottleDecision(true, null);
            }

            return _decisions.Dequeue();
        }
    }
}
