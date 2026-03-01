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
            .WithOrigins("http://localhost:4200", "https://localhost:4200")
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
    options.DefaultChallengeScheme = "Cookies";
})
.AddCookie("Cookies", options =>
{
    options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.None;
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
    options.ClientId = githubClientId;
    options.ClientSecret = githubClientSecret;
    options.Scope.Add("repo");
    options.SaveTokens = true;
    options.Events.OnRemoteFailure = context =>
    {
        context.HandleResponse();
        context.Response.Redirect("http://localhost:4200/?authError=github_oauth_failed");
        return Task.CompletedTask;
    };
});
if (gitLabConfigured)
{
    builder.Services.AddAuthentication().AddGitLab("GitLab", options =>
    {
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
    var redirectUri = "http://localhost:4200/";
    var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("OAuth");
    logger?.LogInformation($"GitHub OAuth login initiated. redirect_uri: {redirectUri}");
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
    await context.ChallengeAsync("GitLab", new Microsoft.AspNetCore.Authentication.AuthenticationProperties { RedirectUri = "/" });
});

app.MapGet("/logout", async (HttpContext context) =>
{
    var logger = context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("OAuth");
    logger?.LogInformation("User logout initiated.");
    await context.SignOutAsync("Cookies");
    context.Response.Redirect("http://localhost:4200/");
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
