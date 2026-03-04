using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ReviewWise.Api.Controllers
{
    [ApiController]
    [Route("api/repositories")]
    public class RepositoriesController : ControllerBase
    {
        private const int MaxRenderableFileBytes = 1_048_576;
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

        [Authorize]
        [HttpGet("{owner}/{repo}/pull-requests/{prNumber:int}/files")]
        public async Task<IActionResult> GetPullRequestFiles(string owner, string repo, int prNumber)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            _logger.LogInformation("Fetching changed files for {Owner}/{Repo} PR #{PrNumber} via provider {Provider}.", owner, repo, prNumber, provider);

            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                _logger.LogWarning("Pull request files request unauthorized for {Owner}/{Repo} PR #{PrNumber} because access token is missing.", owner, repo, prNumber);
                return Unauthorized();
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            string apiUrl;
            if (provider == "GitLab")
            {
                var fullPath = Uri.EscapeDataString($"{owner}/{repo}");
                apiUrl = $"https://gitlab.com/api/v4/projects/{fullPath}/merge_requests/{prNumber}/changes";
            }
            else
            {
                apiUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}/files?per_page=100";
            }

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Pull request files fetch failed for {Owner}/{Repo} PR #{PrNumber} via {Provider} with status {StatusCode}.", owner, repo, prNumber, provider, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
            }

            var json = await response.Content.ReadAsStringAsync();
            var root = JsonDocument.Parse(json).RootElement;

            var files = new List<object>();

            if (provider == "GitLab")
            {
                var gitLabHeadRef = root.TryGetProperty("diff_refs", out var diffRefsProp)
                                 && diffRefsProp.ValueKind == JsonValueKind.Object
                                 && diffRefsProp.TryGetProperty("head_sha", out var headShaProp)
                    ? headShaProp.GetString()
                    : null;

                var gitLabBaseRef = root.TryGetProperty("diff_refs", out var diffRefsPropForBase)
                                 && diffRefsPropForBase.ValueKind == JsonValueKind.Object
                                 && diffRefsPropForBase.TryGetProperty("base_sha", out var baseShaProp)
                    ? baseShaProp.GetString()
                    : null;

                if (root.TryGetProperty("changes", out var changes) && changes.ValueKind == JsonValueKind.Array)
                {
                    foreach (var change in changes.EnumerateArray())
                    {
                        var oldPath = change.TryGetProperty("old_path", out var oldPathProp) ? oldPathProp.GetString() : null;
                        var newPath = change.TryGetProperty("new_path", out var newPathProp) ? newPathProp.GetString() : null;
                        var patch = change.TryGetProperty("diff", out var diffProp) ? diffProp.GetString() : null;
                        var newFile = change.TryGetProperty("new_file", out var newFileProp) && newFileProp.GetBoolean();
                        var renamedFile = change.TryGetProperty("renamed_file", out var renamedFileProp) && renamedFileProp.GetBoolean();
                        var deletedFile = change.TryGetProperty("deleted_file", out var deletedFileProp) && deletedFileProp.GetBoolean();

                        var status = deletedFile
                            ? "removed"
                            : newFile
                                ? "added"
                                : renamedFile
                                    ? "renamed"
                                    : "modified";

                        var downloadPath = deletedFile ? oldPath : (newPath ?? oldPath);
                        var downloadRef = deletedFile ? gitLabBaseRef : gitLabHeadRef;

                        files.Add(new
                        {
                            path = newPath ?? oldPath ?? "unknown",
                            status,
                            additions = (int?)null,
                            deletions = (int?)null,
                            changes = (int?)null,
                            patch,
                            oldPath,
                            newPath,
                            url = BuildGitLabPullRequestFileUrl(owner, repo, prNumber, newPath ?? oldPath),
                            downloadUrl = BuildGitLabRawFileUrl(owner, repo, downloadRef, downloadPath)
                        });
                    }
                }
            }
            else
            {
                if (root.ValueKind == JsonValueKind.Array)
                {
                    foreach (var file in root.EnumerateArray())
                    {
                        var path = file.TryGetProperty("filename", out var filenameProp)
                            ? filenameProp.GetString() ?? "unknown"
                            : "unknown";

                        var status = file.TryGetProperty("status", out var statusProp)
                            ? statusProp.GetString() ?? "modified"
                            : "modified";

                        var additions = file.TryGetProperty("additions", out var additionsProp)
                            ? additionsProp.GetInt32()
                            : 0;

                        var deletions = file.TryGetProperty("deletions", out var deletionsProp)
                            ? deletionsProp.GetInt32()
                            : 0;

                        var changesCount = file.TryGetProperty("changes", out var changesProp)
                            ? changesProp.GetInt32()
                            : additions + deletions;

                        var patch = file.TryGetProperty("patch", out var patchProp)
                            ? patchProp.GetString()
                            : null;

                        var fileUrl = BuildGitHubPullRequestFileUrl(owner, repo, prNumber, path);
                        var downloadUrl = file.TryGetProperty("raw_url", out var rawUrlProp)
                            ? rawUrlProp.GetString()
                            : null;

                        files.Add(new
                        {
                            path,
                            status,
                            additions,
                            deletions,
                            changes = changesCount,
                            patch,
                            oldPath = path,
                            newPath = path,
                            url = fileUrl,
                            downloadUrl
                        });
                    }
                }
            }

            _logger.LogInformation("Fetched {FileCount} changed files for {Owner}/{Repo} PR #{PrNumber} via {Provider}.", files.Count, owner, repo, prNumber, provider);
            return Ok(files);
        }

        [Authorize]
        [HttpGet("{owner}/{repo}/pull-requests/{prNumber:int}/comparison")]
        public async Task<IActionResult> GetPullRequestComparison(string owner, string repo, int prNumber)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";

            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                return Unauthorized();
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            if (provider == "GitLab")
            {
                var fullPath = Uri.EscapeDataString($"{owner}/{repo}");
                var mrUrl = $"https://gitlab.com/api/v4/projects/{fullPath}/merge_requests/{prNumber}";
                var mrResponse = await client.GetAsync(mrUrl);
                if (!mrResponse.IsSuccessStatusCode)
                {
                    return StatusCode((int)mrResponse.StatusCode, await mrResponse.Content.ReadAsStringAsync());
                }

                var mrJson = await mrResponse.Content.ReadAsStringAsync();
                var mrRoot = JsonDocument.Parse(mrJson).RootElement;

                var gitLabBaseRef = mrRoot.TryGetProperty("target_branch", out var targetBranchProp)
                    ? targetBranchProp.GetString()
                    : null;
                var gitLabHeadRef = mrRoot.TryGetProperty("source_branch", out var sourceBranchProp)
                    ? sourceBranchProp.GetString()
                    : null;

                var diffRefs = mrRoot.TryGetProperty("diff_refs", out var diffRefsProp)
                    ? diffRefsProp
                    : default;

                var gitLabBaseSha = diffRefs.ValueKind == JsonValueKind.Object && diffRefs.TryGetProperty("base_sha", out var gitLabBaseShaProp)
                    ? gitLabBaseShaProp.GetString()
                    : null;
                var gitLabHeadSha = diffRefs.ValueKind == JsonValueKind.Object && diffRefs.TryGetProperty("head_sha", out var gitLabHeadShaProp)
                    ? gitLabHeadShaProp.GetString()
                    : null;

                return Ok(new
                {
                    provider,
                    diffMode = "three-dot",
                    baseRef = gitLabBaseRef,
                    baseSha = gitLabBaseSha,
                    headRef = gitLabHeadRef,
                    headSha = gitLabHeadSha,
                    mergeBaseSha = gitLabBaseSha,
                    summary = "Comparing merge-base to source branch tip (three-dot style)."
                });
            }

            var prUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}";
            var prResponse = await client.GetAsync(prUrl);
            if (!prResponse.IsSuccessStatusCode)
            {
                return StatusCode((int)prResponse.StatusCode, await prResponse.Content.ReadAsStringAsync());
            }

            var prJson = await prResponse.Content.ReadAsStringAsync();
            var prRoot = JsonDocument.Parse(prJson).RootElement;

            var baseInfo = prRoot.TryGetProperty("base", out var baseProp) ? baseProp : default;
            var headInfo = prRoot.TryGetProperty("head", out var headProp) ? headProp : default;

            var baseRef = baseInfo.ValueKind == JsonValueKind.Object && baseInfo.TryGetProperty("ref", out var baseRefProp)
                ? baseRefProp.GetString()
                : null;
            var baseSha = baseInfo.ValueKind == JsonValueKind.Object && baseInfo.TryGetProperty("sha", out var baseShaProp)
                ? baseShaProp.GetString()
                : null;
            var headRef = headInfo.ValueKind == JsonValueKind.Object && headInfo.TryGetProperty("ref", out var headRefProp)
                ? headRefProp.GetString()
                : null;
            var headSha = headInfo.ValueKind == JsonValueKind.Object && headInfo.TryGetProperty("sha", out var headShaProp)
                ? headShaProp.GetString()
                : null;

            string? mergeBaseSha = null;
            if (!string.IsNullOrWhiteSpace(baseSha) && !string.IsNullOrWhiteSpace(headSha))
            {
                var compareUrl = $"https://api.github.com/repos/{owner}/{repo}/compare/{baseSha}...{headSha}";
                var compareResponse = await client.GetAsync(compareUrl);
                if (compareResponse.IsSuccessStatusCode)
                {
                    var compareJson = await compareResponse.Content.ReadAsStringAsync();
                    var compareRoot = JsonDocument.Parse(compareJson).RootElement;
                    mergeBaseSha = compareRoot.TryGetProperty("merge_base_commit", out var mergeBaseProp)
                                   && mergeBaseProp.TryGetProperty("sha", out var mergeBaseShaProp)
                        ? mergeBaseShaProp.GetString()
                        : null;
                }
            }

            return Ok(new
            {
                provider,
                diffMode = "three-dot",
                baseRef,
                baseSha,
                headRef,
                headSha,
                mergeBaseSha,
                summary = "Comparing merge-base to head commit (three-dot)."
            });
        }

        [Authorize]
        [HttpGet("{owner}/{repo}/pull-requests/{prNumber:int}/file-content")]
        public async Task<IActionResult> GetPullRequestFileContent(
            string owner,
            string repo,
            int prNumber,
            [FromQuery] string path,
            [FromQuery] string? oldPath,
            [FromQuery] string? newPath,
            [FromQuery] string? status)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                return Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(path))
            {
                return BadRequest(new { message = "Query parameter 'path' is required." });
            }

            var normalizedStatus = (status ?? "modified").Trim().ToLowerInvariant();
            var resolvedOldPath = string.IsNullOrWhiteSpace(oldPath) ? path : oldPath;
            var resolvedNewPath = string.IsNullOrWhiteSpace(newPath) ? path : newPath;

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var oldResult = new FileContentFetchResult(null, false);
            var newResult = new FileContentFetchResult(null, false);

            if (provider == "GitLab")
            {
                var fullPath = Uri.EscapeDataString($"{owner}/{repo}");
                var mrUrl = $"https://gitlab.com/api/v4/projects/{fullPath}/merge_requests/{prNumber}";
                var mrResponse = await client.GetAsync(mrUrl);
                if (!mrResponse.IsSuccessStatusCode)
                {
                    return StatusCode((int)mrResponse.StatusCode, await mrResponse.Content.ReadAsStringAsync());
                }

                var mrJson = await mrResponse.Content.ReadAsStringAsync();
                var mrRoot = JsonDocument.Parse(mrJson).RootElement;

                var diffRefs = mrRoot.TryGetProperty("diff_refs", out var diffRefsProp) ? diffRefsProp : default;
                var baseSha = diffRefs.ValueKind == JsonValueKind.Object && diffRefs.TryGetProperty("base_sha", out var baseShaProp)
                    ? baseShaProp.GetString()
                    : null;
                var headSha = diffRefs.ValueKind == JsonValueKind.Object && diffRefs.TryGetProperty("head_sha", out var headShaProp)
                    ? headShaProp.GetString()
                    : null;

                if (!string.IsNullOrWhiteSpace(baseSha) && normalizedStatus != "added")
                {
                    oldResult = await TryGetGitLabFileContentAsync(client, fullPath, resolvedOldPath!, baseSha!);
                }

                if (!string.IsNullOrWhiteSpace(headSha) && normalizedStatus != "removed")
                {
                    newResult = await TryGetGitLabFileContentAsync(client, fullPath, resolvedNewPath!, headSha!);
                }
            }
            else
            {
                var prUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}";
                var prResponse = await client.GetAsync(prUrl);
                if (!prResponse.IsSuccessStatusCode)
                {
                    return StatusCode((int)prResponse.StatusCode, await prResponse.Content.ReadAsStringAsync());
                }

                var prJson = await prResponse.Content.ReadAsStringAsync();
                var prRoot = JsonDocument.Parse(prJson).RootElement;

                var baseSha = prRoot.TryGetProperty("base", out var baseProp)
                              && baseProp.TryGetProperty("sha", out var baseShaProp)
                    ? baseShaProp.GetString()
                    : null;

                var headSha = prRoot.TryGetProperty("head", out var headProp)
                              && headProp.TryGetProperty("sha", out var headShaProp)
                    ? headShaProp.GetString()
                    : null;

                if (!string.IsNullOrWhiteSpace(baseSha) && normalizedStatus != "added")
                {
                    oldResult = await TryGetGitHubFileContentAsync(client, owner, repo, resolvedOldPath!, baseSha!);
                }

                if (!string.IsNullOrWhiteSpace(headSha) && normalizedStatus != "removed")
                {
                    newResult = await TryGetGitHubFileContentAsync(client, owner, repo, resolvedNewPath!, headSha!);
                }
            }

            return Ok(new
            {
                path,
                oldPath = resolvedOldPath,
                newPath = resolvedNewPath,
                status = normalizedStatus,
                oldContent = oldResult.Content,
                newContent = newResult.Content,
                oldTooLarge = oldResult.TooLarge,
                newTooLarge = newResult.TooLarge,
                sizeCapBytes = MaxRenderableFileBytes
            });
        }

        private static string BuildGitHubPullRequestFileUrl(string owner, string repo, int prNumber, string filePath)
        {
            var baseUrl = $"https://github.com/{owner}/{repo}/pull/{prNumber}/files";
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return baseUrl;
            }

            var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(filePath));
            var hashHex = Convert.ToHexString(hashBytes).ToLowerInvariant();
            return $"{baseUrl}#diff-{hashHex}";
        }

        private static string BuildGitLabPullRequestFileUrl(string owner, string repo, int prNumber, string? filePath)
        {
            var baseUrl = $"https://gitlab.com/{owner}/{repo}/-/merge_requests/{prNumber}/diffs";
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return baseUrl;
            }

            var anchor = filePath.Replace("/", "%2F", StringComparison.Ordinal);
            return $"{baseUrl}#{anchor}";
        }

        private static string? BuildGitLabRawFileUrl(string owner, string repo, string? @ref, string? filePath)
        {
            if (string.IsNullOrWhiteSpace(@ref) || string.IsNullOrWhiteSpace(filePath))
            {
                return null;
            }

            var encodedRef = Uri.EscapeDataString(@ref);
            var encodedPath = Uri.EscapeDataString(filePath).Replace("%2F", "/", StringComparison.Ordinal);
            return $"https://gitlab.com/{owner}/{repo}/-/raw/{encodedRef}/{encodedPath}";
        }

        private static async Task<FileContentFetchResult> TryGetGitHubFileContentAsync(HttpClient client, string owner, string repo, string path, string @ref)
        {
            var encodedPath = Uri.EscapeDataString(path).Replace("%2F", "/", StringComparison.Ordinal);
            var url = $"https://api.github.com/repos/{owner}/{repo}/contents/{encodedPath}?ref={Uri.EscapeDataString(@ref)}";
            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                return new FileContentFetchResult(null, false);
            }

            var json = await response.Content.ReadAsStringAsync();
            var root = JsonDocument.Parse(json).RootElement;
            var size = root.TryGetProperty("size", out var sizeProp) ? sizeProp.GetInt32() : 0;
            if (size > MaxRenderableFileBytes)
            {
                return new FileContentFetchResult(null, true);
            }

            if (!root.TryGetProperty("content", out var contentProp))
            {
                return new FileContentFetchResult(null, false);
            }

            var encoded = contentProp.GetString();
            if (string.IsNullOrWhiteSpace(encoded))
            {
                return new FileContentFetchResult(null, false);
            }

            var normalized = encoded.Replace("\n", string.Empty, StringComparison.Ordinal).Replace("\r", string.Empty, StringComparison.Ordinal);
            try
            {
                var bytes = Convert.FromBase64String(normalized);
                if (bytes.Length > MaxRenderableFileBytes)
                {
                    return new FileContentFetchResult(null, true);
                }

                return new FileContentFetchResult(Encoding.UTF8.GetString(bytes), false);
            }
            catch
            {
                return new FileContentFetchResult(null, false);
            }
        }

        private static async Task<FileContentFetchResult> TryGetGitLabFileContentAsync(HttpClient client, string encodedProjectPath, string path, string @ref)
        {
            var encodedFilePath = Uri.EscapeDataString(path);
            var url = $"https://gitlab.com/api/v4/projects/{encodedProjectPath}/repository/files/{encodedFilePath}?ref={Uri.EscapeDataString(@ref)}";
            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                return new FileContentFetchResult(null, false);
            }

            var json = await response.Content.ReadAsStringAsync();
            var root = JsonDocument.Parse(json).RootElement;
            var size = root.TryGetProperty("size", out var sizeProp) ? sizeProp.GetInt32() : 0;
            if (size > MaxRenderableFileBytes)
            {
                return new FileContentFetchResult(null, true);
            }

            if (!root.TryGetProperty("content", out var contentProp))
            {
                return new FileContentFetchResult(null, false);
            }

            var encoded = contentProp.GetString();
            if (string.IsNullOrWhiteSpace(encoded))
            {
                return new FileContentFetchResult(null, false);
            }

            var normalized = encoded.Replace("\n", string.Empty, StringComparison.Ordinal).Replace("\r", string.Empty, StringComparison.Ordinal);
            try
            {
                var bytes = Convert.FromBase64String(normalized);
                if (bytes.Length > MaxRenderableFileBytes)
                {
                    return new FileContentFetchResult(null, true);
                }

                return new FileContentFetchResult(Encoding.UTF8.GetString(bytes), false);
            }
            catch
            {
                return new FileContentFetchResult(null, false);
            }
        }

        private sealed record FileContentFetchResult(string? Content, bool TooLarge);
    }
}
