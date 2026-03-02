using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ReviewWise.Api.Controllers;
using Xunit;

namespace ReviewWise.Api.Tests.Controllers;

public class RepositoriesControllerTests
{
    [Fact]
    public async Task GetRepositories_WithoutAccessToken_ReturnsUnauthorized()
    {
        var controller = CreateController(token: null, handler: _ => new HttpResponseMessage(HttpStatusCode.OK));

        var result = await controller.GetRepositories();

        Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public async Task GetPullRequests_WhenProviderFails_ReturnsProviderStatusCodeAndBody()
    {
        var controller = CreateController(token: "token-1", handler: _ =>
            new HttpResponseMessage(HttpStatusCode.BadGateway)
            {
                Content = new StringContent("upstream failed", Encoding.UTF8, "text/plain")
            });

        var result = await controller.GetPullRequests("owner1", "repo1");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status502BadGateway, objectResult.StatusCode);
        Assert.Equal("upstream failed", objectResult.Value);
    }

    [Fact]
    public async Task GetPullRequests_GitHubFallbackToIssues_ReturnsPullRequestLikeItems()
    {
        var controller = CreateController(token: "token-2", handler: request =>
        {
            var uri = request.RequestUri?.ToString() ?? string.Empty;
            if (uri.Contains("/pulls?"))
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("[]", Encoding.UTF8, "application/json")
                };
            }

            if (uri.Contains("/issues?"))
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(
                        "[{\"number\":5,\"title\":\"Fix bug\",\"state\":\"open\",\"pull_request\":{}}]",
                        Encoding.UTF8,
                        "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var result = await controller.GetPullRequests("owner2", "repo2");

        var ok = Assert.IsType<OkObjectResult>(result);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        var items = doc.RootElement;
        Assert.Equal(JsonValueKind.Array, items.ValueKind);
        Assert.Single(items.EnumerateArray());
        var first = items[0];
        Assert.Equal(5, first.GetProperty("number").GetInt32());
        Assert.Equal("Fix bug", first.GetProperty("title").GetString());
    }

    private static RepositoriesController CreateController(string? token, Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IAuthenticationService>(new TestAuthenticationService(token));
        var serviceProvider = services.BuildServiceProvider();

        var controller = new RepositoriesController(
            new TestHttpClientFactory(handler),
            NullLogger<RepositoriesController>.Instance);

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
