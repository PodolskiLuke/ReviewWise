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

        public UserProfileController(AppDbContext db, IHttpClientFactory httpClientFactory)
        {
            _db = db;
            _httpClientFactory = httpClientFactory;
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var provider = User.FindFirstValue(ClaimTypes.AuthenticationMethod) ?? "GitHub";
            var accessToken = await HttpContext.GetTokenAsync("access_token");
            if (string.IsNullOrEmpty(accessToken))
                return Unauthorized();

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
                return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());

            var json = await response.Content.ReadAsStringAsync();
            var userInfo = JsonDocument.Parse(json).RootElement;

            // Extract user info
            string username = provider == "GitLab" ? userInfo.GetProperty("username").GetString() : userInfo.GetProperty("login").GetString();
            string? email = userInfo.TryGetProperty("email", out var emailProp) ? emailProp.GetString() : null;

            // Store or update user in DB
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null)
            {
                user = new User { Username = username, Email = email };
                _db.Users.Add(user);
            }
            else
            {
                user.Email = email;
            }
            await _db.SaveChangesAsync();

            return Ok(new { username, email });
        }
    }
}
