using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;

namespace ReviewWise.Api.Controllers
{
    [ApiController]
    [Route("api/user-profile")]
    public class UserProfileController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<UserProfileController> _logger;

        public UserProfileController(AppDbContext db, IHttpClientFactory httpClientFactory, ILogger<UserProfileController> logger)
        {
            _db = db;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            _logger.LogInformation("Fetching user profile from provider {Provider}.", provider);

            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
            {
                _logger.LogWarning("User profile request unauthorized due to missing access token.");
                return Unauthorized();
            }

            var client = _httpClientFactory.CreateClient();
            string apiUrl;
            if (provider == "GitLab")
                apiUrl = "https://gitlab.com/api/v4/user";
            else
                apiUrl = "https://api.github.com/user";

            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ReviewWise", "1.0"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            var response = await client.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("User profile fetch failed for provider {Provider} with status {StatusCode}.", provider, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
            }

            var json = await response.Content.ReadAsStringAsync();
            var userInfo = JsonDocument.Parse(json).RootElement;

            string username = provider == "GitLab" ? userInfo.GetProperty("username").GetString() : userInfo.GetProperty("login").GetString();
            string? email = userInfo.TryGetProperty("email", out var emailProp) ? emailProp.GetString() : null;

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null)
            {
                user = new User { Username = username, Email = email };
                _db.Users.Add(user);
                _logger.LogInformation("Created local profile record for user {Username} from provider {Provider}.", username, provider);
            }
            else
            {
                user.Email = email;
                _logger.LogInformation("Updated local profile record for user {Username} from provider {Provider}.", username, provider);
            }
            await _db.SaveChangesAsync();

            _logger.LogInformation("Returning user profile payload for {Username} from provider {Provider}.", username, provider);

            return Ok(new { username, email });
        }
    }
}
