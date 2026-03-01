using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;

namespace ReviewWise.Api.Controllers
{
    [ApiController]
    [Route("api/repositories")]
    public class RepositoriesController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<RepositoriesController> _logger;

        public RepositoriesController(IHttpClientFactory httpClientFactory, ILogger<RepositoriesController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> GetRepositories()
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            _logger.LogInformation("Fetching repositories for provider {Provider}.", provider);

            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                _logger.LogWarning("Repository request unauthorized because access token is missing.");
                return Unauthorized();
            }

            var client = _httpClientFactory.CreateClient();
            string apiUrl;
            if (provider == "GitLab")
                apiUrl = "https://gitlab.com/api/v4/projects?membership=true&simple=true";
            else
                apiUrl = "https://api.github.com/user/repos";

            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Repository fetch failed for provider {Provider} with status {StatusCode}.", provider, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
            }

            var json = await response.Content.ReadAsStringAsync();
            var repos = JsonDocument.Parse(json).RootElement;
            _logger.LogInformation("Fetched {RepositoryCount} repositories for provider {Provider}.", repos.GetArrayLength(), provider);
            return Ok(repos);
        }

        [Authorize]
        [HttpGet("{owner}/{repo}/pull-requests")]
        public async Task<IActionResult> GetPullRequests(string owner, string repo)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            _logger.LogInformation("Fetching pull requests for {Owner}/{Repo} via provider {Provider}.", owner, repo, provider);

            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                _logger.LogWarning("Pull request request unauthorized for {Owner}/{Repo} because access token is missing.", owner, repo);
                return Unauthorized();
            }

            var client = _httpClientFactory.CreateClient();
            string apiUrl;
            if (provider == "GitLab")
            {
                var fullPath = Uri.EscapeDataString($"{owner}/{repo}");
                apiUrl = $"https://gitlab.com/api/v4/projects/{fullPath}/merge_requests?state=all&per_page=100";
            }
            else
                apiUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls?state=all&per_page=100";

            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Pull request fetch failed for {Owner}/{Repo} via {Provider} with status {StatusCode}.", owner, repo, provider, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
            }

            var json = await response.Content.ReadAsStringAsync();
            var prs = JsonDocument.Parse(json).RootElement;

            if (provider == "GitHub" && prs.ValueKind == JsonValueKind.Array && prs.GetArrayLength() == 0)
            {
                _logger.LogInformation("No pull requests found via pulls API for {Owner}/{Repo}. Falling back to issues API.", owner, repo);

                var issuesUrl = $"https://api.github.com/repos/{owner}/{repo}/issues?state=all&per_page=100";
                var issuesResponse = await client.GetAsync(issuesUrl);
                if (issuesResponse.IsSuccessStatusCode)
                {
                    var issuesJson = await issuesResponse.Content.ReadAsStringAsync();
                    var issues = JsonDocument.Parse(issuesJson).RootElement;

                    if (issues.ValueKind == JsonValueKind.Array)
                    {
                        var pullRequestItems = new List<object>();

                        foreach (var issue in issues.EnumerateArray())
                        {
                            if (!issue.TryGetProperty("pull_request", out _))
                            {
                                continue;
                            }

                            var number = issue.TryGetProperty("number", out var numberProp) ? numberProp.GetInt32() : 0;
                            var title = issue.TryGetProperty("title", out var titleProp) ? titleProp.GetString() : "Untitled pull request";
                            var state = issue.TryGetProperty("state", out var stateProp) ? stateProp.GetString() : "unknown";

                            pullRequestItems.Add(new
                            {
                                number,
                                title,
                                state
                            });
                        }

                        _logger.LogInformation("Fallback issues API returned {PullRequestCount} pull request-like items for {Owner}/{Repo}.", pullRequestItems.Count, owner, repo);
                        return Ok(pullRequestItems);
                    }
                }
                else
                {
                    _logger.LogWarning("Fallback issues API failed for {Owner}/{Repo} with status {StatusCode}.", owner, repo, (int)issuesResponse.StatusCode);
                }
            }

            _logger.LogInformation("Fetched {PullRequestCount} pull requests for {Owner}/{Repo} via {Provider}.", prs.GetArrayLength(), owner, repo, provider);
            return Ok(prs);
        }
    }
}
