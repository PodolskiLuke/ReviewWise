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
        private readonly ILogger<ReviewController> _logger;

        public ReviewController(IHttpClientFactory httpClientFactory, IConfiguration config, ReviewWise.Api.Data.AppDbContext db, ILogger<ReviewController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _config = config;
            _db = db;
            _logger = logger;
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> GetReviewResult(string owner, string repo, int prNumber)
        {
            _logger.LogInformation("Fetching latest review for {Owner}/{Repo} PR #{PrNumber}.", owner, repo, prNumber);

            var review = await _db.ReviewResults
                .Where(r => r.Owner == owner && r.Repo == repo && r.PrNumber == prNumber)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();

            if (review == null)
            {
                _logger.LogInformation("No stored review found for {Owner}/{Repo} PR #{PrNumber}.", owner, repo, prNumber);
                return NotFound(new { message = "No review result found for this PR." });
            }

            _logger.LogInformation("Returning stored review for {Owner}/{Repo} PR #{PrNumber} created at {CreatedAt} by {Username}.", owner, repo, prNumber, review.CreatedAt, review.Username);
            return Ok(new { review = review.Review, createdAt = review.CreatedAt, username = review.Username });
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> ReviewPullRequest(string owner, string repo, int prNumber)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            _logger.LogInformation("Starting review generation for {Owner}/{Repo} PR #{PrNumber} using provider {Provider}.", owner, repo, prNumber, provider);

            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                _logger.LogWarning("Review generation unauthorized for {Owner}/{Repo} PR #{PrNumber} due to missing access token.", owner, repo, prNumber);
                return Unauthorized();
            }

            var client = _httpClientFactory.CreateClient();
            string apiUrl;
            if (provider == "GitLab")
            {
                var fullPath = Uri.EscapeDataString($"{owner}/{repo}");
                apiUrl = $"https://gitlab.com/api/v4/projects/{fullPath}/merge_requests/{prNumber}/changes";
            }
            else
                apiUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}/files";

            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch changed files for {Owner}/{Repo} PR #{PrNumber} via {Provider} with status {StatusCode}.", owner, repo, prNumber, provider, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
            }

            var json = await response.Content.ReadAsStringAsync();
            var files = JsonDocument.Parse(json).RootElement;

            string reviewInput = "";
            if (provider == "GitLab")
            {
                var gitLabChanges = files.GetProperty("changes");
                _logger.LogInformation("Fetched {FileCount} changed files from GitLab for {Owner}/{Repo} PR #{PrNumber}.", gitLabChanges.GetArrayLength(), owner, repo, prNumber);

                foreach (var file in gitLabChanges.EnumerateArray())
                {
                    var oldPath = file.GetProperty("old_path").GetString();
                    var newPath = file.GetProperty("new_path").GetString();
                    var diff = file.GetProperty("diff").GetString();
                    reviewInput += $"File: {oldPath} -> {newPath}\nDiff:\n{diff}\n\n";
                }
            }
            else
            {
                _logger.LogInformation("Fetched {FileCount} changed files from GitHub for {Owner}/{Repo} PR #{PrNumber}.", files.GetArrayLength(), owner, repo, prNumber);

                foreach (var file in files.EnumerateArray())
                {
                    var filename = file.GetProperty("filename").GetString();
                    var patch = file.TryGetProperty("patch", out var patchProp) ? patchProp.GetString() : null;
                    if (!string.IsNullOrEmpty(patch))
                        reviewInput += $"File: {filename}\nPatch:\n{patch}\n\n";
                }
            }

            var openAiKey = _config["OpenAI:ApiKey"];
            if (string.IsNullOrEmpty(openAiKey))
            {
                _logger.LogError("OpenAI API key is not configured for review generation.");
                return StatusCode(500, "OpenAI API key not configured.");
            }

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
            {
                _logger.LogWarning("OpenAI request failed for {Owner}/{Repo} PR #{PrNumber} with status {StatusCode}.", owner, repo, prNumber, (int)openAiResponse.StatusCode);
                return StatusCode((int)openAiResponse.StatusCode, await openAiResponse.Content.ReadAsStringAsync());
            }

            var openAiJson = await openAiResponse.Content.ReadAsStringAsync();
            var openAiResult = JsonDocument.Parse(openAiJson).RootElement;
            var review = openAiResult.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();

            if (string.IsNullOrEmpty(review))
            {
                _logger.LogError("OpenAI returned an empty review for {Owner}/{Repo} PR #{PrNumber}.", owner, repo, prNumber);
                return StatusCode(500, "Failed to generate review from OpenAI.");
            }

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

            _logger.LogInformation("Stored generated review for {Owner}/{Repo} PR #{PrNumber} by {Username}.", owner, repo, prNumber, username);

            return Ok(new { review });
        }
    }
}
