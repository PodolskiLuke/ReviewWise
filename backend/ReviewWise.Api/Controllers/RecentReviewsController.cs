using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Data;

namespace ReviewWise.Api.Controllers;

[ApiController]
[Route("api/reviews/recent")]
public class RecentReviewsController : ControllerBase
{
    private readonly AppDbContext _db;

    public RecentReviewsController(AppDbContext db)
    {
        _db = db;
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int? limit = null)
    {
        var username = User.Identity?.Name
                       ?? User.FindFirstValue(ClaimTypes.Name)
                       ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        var maxItems = Math.Clamp(limit ?? 5, 1, 20);

        var reviews = await _db.ReviewResults
            .Where(review => review.Username == username)
            .OrderByDescending(review => review.CreatedAt)
            .Take(maxItems)
            .Select(review => new
            {
                owner = review.Owner,
                repo = review.Repo,
                prNumber = review.PrNumber,
                createdAt = review.CreatedAt,
                username = review.Username
            })
            .ToListAsync();

        return Ok(new { reviews });
    }
}
