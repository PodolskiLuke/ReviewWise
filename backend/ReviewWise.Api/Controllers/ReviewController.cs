using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Services;

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
        private readonly IReviewGenerationThrottle _reviewGenerationThrottle;

        public ReviewController(IHttpClientFactory httpClientFactory, IConfiguration config, ReviewWise.Api.Data.AppDbContext db, ILogger<ReviewController> logger, IReviewGenerationThrottle reviewGenerationThrottle)
        {
            _httpClientFactory = httpClientFactory;
            _config = config;
            _db = db;
            _logger = logger;
            _reviewGenerationThrottle = reviewGenerationThrottle;
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
                _logger.LogInformation("No stored review found for {Owner}/{Repo} PR #{PrNumber}; returning empty review payload.", owner, repo, prNumber);
                return Ok(new
                {
                    review = (string?)null,
                    createdAt = (DateTime?)null,
                    username = (string?)null
                });
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

            var existingReview = await _db.ReviewResults
                .Where(r => r.Owner == owner && r.Repo == repo && r.PrNumber == prNumber)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();

            if (existingReview != null)
            {
                _logger.LogInformation("Reusing existing stored review for {Owner}/{Repo} PR #{PrNumber} created at {CreatedAt} by {Username}.", owner, repo, prNumber, existingReview.CreatedAt, existingReview.Username);
                return Ok(new
                {
                    review = existingReview.Review,
                    createdAt = existingReview.CreatedAt,
                    username = existingReview.Username,
                    reused = true
                });
            }

            var username = User.Identity?.Name ?? "unknown";
            var cooldownSeconds = _config.GetValue<int?>("ReviewGeneration:CooldownSeconds") ?? 60;
            var now = DateTimeOffset.UtcNow;
            var attemptKey = $"{username}|{owner}|{repo}|{prNumber}";

            var throttleDecision = _reviewGenerationThrottle.CheckAndTrack(
                attemptKey,
                TimeSpan.FromSeconds(cooldownSeconds),
                now);

            if (!throttleDecision.IsAllowed)
            {
                var retryAfterSeconds = throttleDecision.RetryAfterSeconds ?? cooldownSeconds;
                _logger.LogWarning("Review generation throttled for {Owner}/{Repo} PR #{PrNumber} by {Username}. Retry after {RetryAfterSeconds}s.", owner, repo, prNumber, username, retryAfterSeconds);
                Response.Headers.RetryAfter = retryAfterSeconds.ToString();
                return StatusCode(StatusCodes.Status429TooManyRequests, new
                {
                    message = $"Review generation was requested too recently. Try again in {retryAfterSeconds} seconds.",
                    retryAfterSeconds
                });
            }

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
            var openAiModel = _config["OpenAI:Model"];
            if (string.IsNullOrWhiteSpace(openAiModel))
            {
                openAiModel = "gpt-4o-mini";
            }

            var prompt = $"You are an expert code reviewer. Review the following code changes for bugs, security issues, and suggest improvements.\n\n{reviewInput}";
            var openAiRequest = new
            {
                model = openAiModel,
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
                var openAiErrorBody = await openAiResponse.Content.ReadAsStringAsync();

                if (openAiResponse.StatusCode == HttpStatusCode.TooManyRequests)
                {
                    var useFallbackReview = _config.GetValue<bool?>("OpenAI:UseFallbackReviewWhenRateLimited") == true;
                    if (useFallbackReview)
                    {
                        var fallbackReview = BuildRateLimitFallbackReview(owner, repo, prNumber, provider);
                        _logger.LogWarning(
                            "OpenAI rate-limited review generation for {Owner}/{Repo} PR #{PrNumber}. Returning configured fallback review.",
                            owner,
                            repo,
                            prNumber);

                        return Ok(new
                        {
                            review = fallbackReview,
                            createdAt = DateTime.UtcNow,
                            username,
                            reused = false,
                            providerFallback = true
                        });
                    }

                    var retryAfterSeconds = ParseRetryAfterSeconds(openAiResponse.Headers.RetryAfter?.Delta);
                    if (retryAfterSeconds is not null)
                    {
                        Response.Headers.RetryAfter = retryAfterSeconds.Value.ToString();
                    }

                    _logger.LogWarning(
                        "OpenAI rate-limited review generation for {Owner}/{Repo} PR #{PrNumber}. Retry after {RetryAfterSeconds}s.",
                        owner,
                        repo,
                        prNumber,
                        retryAfterSeconds ?? 0);

                    return StatusCode(StatusCodes.Status429TooManyRequests, new
                    {
                        message = retryAfterSeconds is not null
                            ? $"AI provider rate limit reached. Try again in {retryAfterSeconds.Value} seconds."
                            : "AI provider rate limit reached. Please wait a moment and try again.",
                        retryAfterSeconds
                    });
                }

                if (openAiResponse.StatusCode == HttpStatusCode.NotFound && IsModelNotFoundError(openAiErrorBody))
                {
                    _logger.LogError("Configured OpenAI model '{Model}' is unavailable for review generation.", openAiModel);
                    return StatusCode(StatusCodes.Status502BadGateway, new
                    {
                        message = $"Configured OpenAI model '{openAiModel}' is not available for this API key. Update OpenAI:Model or API access."
                    });
                }

                _logger.LogWarning("OpenAI request failed for {Owner}/{Repo} PR #{PrNumber} with status {StatusCode}.", owner, repo, prNumber, (int)openAiResponse.StatusCode);
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = "AI review generation provider request failed.",
                    providerStatusCode = (int)openAiResponse.StatusCode
                });
            }

            var openAiJson = await openAiResponse.Content.ReadAsStringAsync();
            var openAiResult = JsonDocument.Parse(openAiJson).RootElement;
            var review = openAiResult.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();

            if (string.IsNullOrEmpty(review))
            {
                _logger.LogError("OpenAI returned an empty review for {Owner}/{Repo} PR #{PrNumber}.", owner, repo, prNumber);
                return StatusCode(500, "Failed to generate review from OpenAI.");
            }

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

            return Ok(new
            {
                review,
                createdAt = reviewResult.CreatedAt,
                username = reviewResult.Username,
                reused = false
            });
        }

        private static bool IsModelNotFoundError(string responseBody)
        {
            if (string.IsNullOrWhiteSpace(responseBody))
            {
                return false;
            }

            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;
                if (!root.TryGetProperty("error", out var error))
                {
                    return false;
                }

                var code = error.TryGetProperty("code", out var codeElement)
                    ? codeElement.GetString()
                    : null;
                return string.Equals(code, "model_not_found", StringComparison.OrdinalIgnoreCase);
            }
            catch (JsonException)
            {
                return false;
            }
        }

        private static int? ParseRetryAfterSeconds(TimeSpan? retryAfterDelta)
        {
            if (retryAfterDelta is null)
            {
                return null;
            }

            var seconds = (int)Math.Ceiling(retryAfterDelta.Value.TotalSeconds);
            return seconds > 0 ? seconds : null;
        }

        private static string BuildRateLimitFallbackReview(string owner, string repo, int prNumber, string provider)
        {
            return $"Temporary fallback review for {owner}/{repo} PR #{prNumber} ({provider}).\n\n" +
                   "AI provider is currently rate-limited, so this is a lightweight placeholder result.\n" +
                   "Please retry generation shortly to receive a full AI review with detailed findings.\n\n" +
                   "Quick checklist while waiting:\n" +
                   "- Verify high-risk file changes first (auth, data access, API boundaries).\n" +
                   "- Check for null/edge-case handling and error paths.\n" +
                   "- Validate security-sensitive changes and input handling.";
        }
    }
}
