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

        public RepositoriesController(IHttpClientFactory httpClientFactory)
        {
            _httpClientFactory = httpClientFactory;
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> GetRepositories()
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
                return Unauthorized();

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
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());

            var json = await response.Content.ReadAsStringAsync();
            var repos = JsonDocument.Parse(json).RootElement;
            return Ok(repos);
        }

        [Authorize]
        [HttpGet("{owner}/{repo}/pull-requests")]
        public async Task<IActionResult> GetPullRequests(string owner, string repo)
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
                return Unauthorized();

            var client = _httpClientFactory.CreateClient();
            string apiUrl;
            if (provider == "GitLab")
                apiUrl = $"https://gitlab.com/api/v4/projects/{owner}%2F{repo}/merge_requests";
            else
                apiUrl = $"https://api.github.com/repos/{owner}/{repo}/pulls";

            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());

            var json = await response.Content.ReadAsStringAsync();
            var prs = JsonDocument.Parse(json).RootElement;
            return Ok(prs);
        }
    }
}
