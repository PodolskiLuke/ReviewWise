using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ReviewWise.Api.Controllers;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;
using Xunit;

namespace ReviewWise.Api.Tests.Controllers;

public class UserProfileControllerTests
{
    [Fact]
    public async Task Get_WithoutAccessToken_ReturnsUnauthorized()
    {
        using var db = CreateDb();
        var controller = CreateController(db, token: null, responseBody: "{}", statusCode: HttpStatusCode.OK);

        var result = await controller.Get();

        Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public async Task Get_WithGitHubPayload_CreatesOrUpdatesUser_AndReturnsProfile()
    {
        using var db = CreateDb();
        var payload = "{\"login\":\"alice\",\"email\":\"alice@example.com\"}";
        var controller = CreateController(db, token: "token-123", responseBody: payload, statusCode: HttpStatusCode.OK);

        var result = await controller.Get();

        var ok = Assert.IsType<OkObjectResult>(result);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        Assert.Equal("alice", doc.RootElement.GetProperty("username").GetString());
        Assert.Equal("alice@example.com", doc.RootElement.GetProperty("email").GetString());

        var storedUser = await db.Users.SingleAsync(u => u.Username == "alice");
        Assert.Equal("alice@example.com", storedUser.Email);
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"user-profile-tests-{Guid.NewGuid():N}")
            .Options;
        return new AppDbContext(options);
    }

    private static UserProfileController CreateController(AppDbContext db, string? token, string responseBody, HttpStatusCode statusCode)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IAuthenticationService>(new TestAuthenticationService(token));
        var serviceProvider = services.BuildServiceProvider();

        var controller = new UserProfileController(
            db,
            new TestHttpClientFactory(_ => new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json")
            }),
            NullLogger<UserProfileController>.Instance);

        var httpContext = new DefaultHttpContext
        {
            RequestServices = serviceProvider,
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Name, "test-user"),
                new Claim(ClaimTypes.AuthenticationMethod, "GitHub")
            ], "TestAuth"))
        };

        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public TestHttpClientFactory(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        public HttpClient CreateClient(string name)
        {
            return new HttpClient(new DelegateHttpMessageHandler(_handler));
        }
    }

    private sealed class DelegateHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public DelegateHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }

    private sealed class TestAuthenticationService : IAuthenticationService
    {
        private readonly string? _token;

        public TestAuthenticationService(string? token)
        {
            _token = token;
        }

        public Task<AuthenticateResult> AuthenticateAsync(HttpContext context, string? scheme)
        {
            var identity = new ClaimsIdentity("TestAuth");
            var principal = new ClaimsPrincipal(identity);
            var properties = new AuthenticationProperties();
            if (!string.IsNullOrEmpty(_token))
            {
                properties.StoreTokens([new AuthenticationToken { Name = "access_token", Value = _token }]);
            }

            var ticket = new AuthenticationTicket(principal, properties, scheme ?? "TestAuth");
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }

        public Task ChallengeAsync(HttpContext context, string? scheme, AuthenticationProperties? properties) => Task.CompletedTask;
        public Task ForbidAsync(HttpContext context, string? scheme, AuthenticationProperties? properties) => Task.CompletedTask;
        public Task SignInAsync(HttpContext context, string? scheme, ClaimsPrincipal principal, AuthenticationProperties? properties) => Task.CompletedTask;
        public Task SignOutAsync(HttpContext context, string? scheme, AuthenticationProperties? properties) => Task.CompletedTask;
    }
}
