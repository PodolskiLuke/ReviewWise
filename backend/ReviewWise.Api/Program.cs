using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Data;
using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

// Configure logging to console
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// Add services to the container.
builder.Services.AddOpenApi();
builder.Services.AddHttpClient();
builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDevPolicy", policy =>
    {
        policy
            .SetIsOriginAllowed(static origin => IsAllowedLocalDevOrigin(origin))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

var githubClientId = RequireConfiguredSetting(builder.Configuration, "Authentication:GitHub:ClientId");
var githubClientSecret = RequireConfiguredSetting(builder.Configuration, "Authentication:GitHub:ClientSecret");

var gitLabClientId = builder.Configuration["Authentication:GitLab:ClientId"];
var gitLabClientSecret = builder.Configuration["Authentication:GitLab:ClientSecret"];
var gitLabConfigured =
    !string.IsNullOrWhiteSpace(gitLabClientId) &&
    !string.IsNullOrWhiteSpace(gitLabClientSecret) &&
    !gitLabClientId.StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase) &&
    !gitLabClientSecret.StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase);

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = "Cookies";
    options.DefaultSignInScheme = "Cookies";
    options.DefaultChallengeScheme = "Cookies";
})
.AddCookie("Cookies", options =>
{
    options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
    options.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.None;
    options.Events = new Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationEvents
    {
        OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }

            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        },
        OnRedirectToAccessDenied = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }

            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        }
    };
})
.AddGitHub("GitHub", options =>
{
    options.SignInScheme = "Cookies";
    options.ClientId = githubClientId;
    options.ClientSecret = githubClientSecret;
    options.Scope.Add("repo");
    options.SaveTokens = true;
    options.Events.OnRemoteFailure = context =>
    {
        context.HandleResponse();
        var frontendBaseUrl = ResolveFrontendBaseUrl(context.Request, builder.Configuration);
        context.Response.Redirect($"{frontendBaseUrl}/?authError=github_oauth_failed");
        return Task.CompletedTask;
    };
});
if (gitLabConfigured)
{
    builder.Services.AddAuthentication().AddGitLab("GitLab", options =>
    {
        options.SignInScheme = "Cookies";
        options.ClientId = gitLabClientId!;
        options.ClientSecret = gitLabClientSecret!;
        options.SaveTokens = true;
    });
}

builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("FrontendDevPolicy");
app.UseAuthentication();
app.UseAuthorization();


// Add login/logout endpoints

app.MapGet("/login", async (HttpContext context) =>
{
    var frontendBaseUrl = ResolveFrontendBaseUrl(context.Request, builder.Configuration);
    var redirectUri = $"{frontendBaseUrl}/home?oauth=1";
    var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("OAuth");
    logger?.LogInformation("GitHub OAuth login initiated. redirect_uri: {RedirectUri}", redirectUri);
    await context.ChallengeAsync("GitHub", new Microsoft.AspNetCore.Authentication.AuthenticationProperties { RedirectUri = redirectUri });
});

app.MapGet("/login-gitlab", async (HttpContext context) =>
{
    var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("OAuth");

    if (!gitLabConfigured)
    {
        logger?.LogWarning("GitLab OAuth login requested but GitLab OAuth settings are not configured.");
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsync("GitLab authentication is not configured.");
        return;
    }

    logger?.LogInformation("GitLab OAuth login initiated.");
    var frontendBaseUrl = ResolveFrontendBaseUrl(context.Request, builder.Configuration);
    await context.ChallengeAsync("GitLab", new Microsoft.AspNetCore.Authentication.AuthenticationProperties { RedirectUri = $"{frontendBaseUrl}/home?oauth=1" });
});

app.MapGet("/logout", async (HttpContext context) =>
{
    var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("OAuth");
    var frontendBaseUrl = ResolveFrontendBaseUrl(context.Request, builder.Configuration);
    logger?.LogInformation("User logout initiated.");
    await context.SignOutAsync("Cookies");
    context.Response.Redirect($"{frontendBaseUrl}/");
});

app.MapGet("/api/auth/users", (HttpContext context) =>
{
    var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("AuthUsers");
    var isAuthenticated = context.User?.Identity?.IsAuthenticated == true;
    if (!isAuthenticated)
    {
        logger?.LogInformation("Auth status requested for anonymous user.");
        return Results.Ok(new { authenticated = false });
    }

    var provider = context.User?.FindFirst(ClaimTypes.AuthenticationMethod)?.Value ?? "GitHub";
    var username = context.User?.Identity?.Name
        ?? context.User?.FindFirst(ClaimTypes.Name)?.Value
        ?? context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    logger?.LogInformation("Auth status requested for authenticated user {Username} via {Provider}.", username, provider);

    return Results.Ok(new
    {
        authenticated = true,
        provider,
        username
    });
});

app.MapControllers();

app.Run();

static string RequireConfiguredSetting(IConfiguration configuration, string key)
{
    var value = configuration[key];
    if (string.IsNullOrWhiteSpace(value) || value.StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException($"Missing required configuration value: '{key}'.");
    }

    return value;
}

static bool IsAllowedLocalDevOrigin(string origin)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
        return false;
    }

    return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || uri.Host.Equals("127.0.0.1");
}

static string ResolveFrontendBaseUrl(HttpRequest request, IConfiguration configuration)
{
    var origin = request.Headers.Origin.ToString();
    if (IsAllowedLocalDevOrigin(origin))
    {
        return origin.TrimEnd('/');
    }

    var referer = request.Headers.Referer.ToString();
    if (Uri.TryCreate(referer, UriKind.Absolute, out var refererUri)
        && (refererUri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || refererUri.Host.Equals("127.0.0.1")))
    {
        return $"{refererUri.Scheme}://{refererUri.Authority}";
    }

    var configuredBaseUrl = configuration["Frontend:BaseUrl"];
    if (!string.IsNullOrWhiteSpace(configuredBaseUrl))
    {
        return configuredBaseUrl.TrimEnd('/');
    }

    return "http://localhost:4200";
}
