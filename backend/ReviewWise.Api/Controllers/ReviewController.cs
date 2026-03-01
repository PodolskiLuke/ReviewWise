using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ReviewWise.Api.Controllers
{
    [ApiController]
    [Route("api/repositories/{owner}/{repo}/pull-requests/{prNumber}/review")]
    public class ReviewController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _config;
        private readonly ReviewWise.Api.Data.AppDbContext _db;
        public ReviewController(IHttpClientFactory httpClientFactory, IConfiguration config, ReviewWise.Api.Data.AppDbContext db)
        {
            _httpClientFactory = httpClientFactory;
            _config = config;
            _db = db;
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> GetReviewResult(string owner, string repo, int prNumber)
        {
            var review = await _db.ReviewResults
                .Where(r => r.Owner == owner && r.Repo == repo && r.PrNumber == prNumber)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();
            if (review == null)
                return NotFound(new { message = "No review result found for this PR." });
            return Ok(new { review = review.Review, createdAt = review.CreatedAt, username = review.Username });
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> ReviewPullRequest(string owner, string repo, int prNumber)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
                return Unauthorized();

            var client = _httpClientFactory.CreateClient();
            string apiUrl;
            if (provider == "GitLab")
                apiUrl = $"https://gitlab.com/api/v4/projects/{owner}%2F{repo}/merge_requests/{prNumber}/changes";
            else
                apiUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}/files";

            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());

            var json = await response.Content.ReadAsStringAsync();
            var files = JsonDocument.Parse(json).RootElement;

            // Collect all file diffs/patches or content into a single string for review
            string reviewInput = "";
            if (provider == "GitLab")
            {
                foreach (var file in files.GetProperty("changes").EnumerateArray())
                {
                    var oldPath = file.GetProperty("old_path").GetString();
                    var newPath = file.GetProperty("new_path").GetString();
                    var diff = file.GetProperty("diff").GetString();
                    reviewInput += $"File: {oldPath} -> {newPath}\nDiff:\n{diff}\n\n";
                }
            }
            else
            {
                foreach (var file in files.EnumerateArray())
                {
                    var filename = file.GetProperty("filename").GetString();
                    var patch = file.TryGetProperty("patch", out var patchProp) ? patchProp.GetString() : null;
                    if (!string.IsNullOrEmpty(patch))
                        reviewInput += $"File: {filename}\nPatch:\n{patch}\n\n";
                }
            }

            // Call OpenAI API
            var openAiKey = _config["OpenAI:ApiKey"];
            if (string.IsNullOrEmpty(openAiKey))
                return StatusCode(500, "OpenAI API key not configured.");

            var openAiClient = _httpClientFactory.CreateClient();
            openAiClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", openAiKey);
            var prompt = $"You are an expert code reviewer. Review the following code changes for bugs, security issues, and suggest improvements.\n\n{reviewInput}";
            var openAiRequest = new
            {
                model = "gpt-4",
                messages = new[] {
                    new { role = "system", content = "You are an expert code reviewer." },
                    new { role = "user", content = prompt }
                },
                max_tokens = 800
            };
            var openAiContent = new StringContent(JsonSerializer.Serialize(openAiRequest), System.Text.Encoding.UTF8, "application/json");
            var openAiResponse = await openAiClient.PostAsync("https://api.openai.com/v1/chat/completions", openAiContent);
            if (!openAiResponse.IsSuccessStatusCode)
                return StatusCode((int)openAiResponse.StatusCode, await openAiResponse.Content.ReadAsStringAsync());

            var openAiJson = await openAiResponse.Content.ReadAsStringAsync();
            var openAiResult = JsonDocument.Parse(openAiJson).RootElement;
            var review = openAiResult.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();

            // Store review result in DB
            var username = User.Identity?.Name ?? "unknown";
            var reviewResult = new ReviewWise.Api.Models.ReviewResult
            {
                Owner = owner,
                Repo = repo,
                PrNumber = prNumber,
                Username = username,
                Review = review,
                CreatedAt = DateTime.UtcNow
            };
            _db.ReviewResults.Add(reviewResult);
            await _db.SaveChangesAsync();

            return Ok(new { review });
        }
    }
}
