using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Controllers;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;
using Xunit;

namespace ReviewWise.Api.Tests.Controllers;

public class RecentReviewsControllerTests
{
    [Fact]
    public async Task Get_ReturnsRecentReviewsForAuthenticatedUser()
    {
        await using var db = CreateDbContext();
        SeedReview(db, "owner-1", "repo-1", 101, "ci-user", DateTime.UtcNow.AddMinutes(-30));
        SeedReview(db, "owner-2", "repo-2", 102, "ci-user", DateTime.UtcNow.AddMinutes(-20));
        SeedReview(db, "owner-3", "repo-3", 103, "ci-user", DateTime.UtcNow.AddMinutes(-10));
        SeedReview(db, "other-owner", "other-repo", 201, "another-user", DateTime.UtcNow.AddMinutes(-5));
        await db.SaveChangesAsync();

        var controller = CreateController(db, "ci-user");

        var result = await controller.Get(limit: 2);

        var ok = Assert.IsType<OkObjectResult>(result);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        var reviews = doc.RootElement.GetProperty("reviews");

        Assert.Equal(2, reviews.GetArrayLength());
        Assert.Equal("owner-3", reviews[0].GetProperty("owner").GetString());
        Assert.Equal("owner-2", reviews[1].GetProperty("owner").GetString());
    }

    [Fact]
    public async Task Get_WhenUserMissing_ReturnsUnauthorized()
    {
        await using var db = CreateDbContext();
        var controller = new RecentReviewsController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity())
                }
            }
        };

        var result = await controller.Get();

        Assert.IsType<UnauthorizedResult>(result);
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"recent-reviews-tests-{Guid.NewGuid():N}")
            .Options;

        return new AppDbContext(options);
    }

    private static RecentReviewsController CreateController(AppDbContext db, string username)
    {
        return new RecentReviewsController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim(ClaimTypes.Name, username)
                    ], "TestAuth"))
                }
            }
        };
    }

    private static void SeedReview(AppDbContext db, string owner, string repo, int prNumber, string username, DateTime createdAt)
    {
        db.ReviewResults.Add(new ReviewResult
        {
            Owner = owner,
            Repo = repo,
            PrNumber = prNumber,
            Username = username,
            Review = "review text",
            CreatedAt = createdAt
        });
    }
}
