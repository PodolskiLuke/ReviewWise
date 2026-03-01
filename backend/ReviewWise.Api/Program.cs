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
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = "Cookies";
    options.DefaultChallengeScheme = "GitHub";
})
.AddCookie("Cookies", options =>
{
    options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.None;
    options.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.None;
})
.AddGitHub("GitHub", options =>
{
    options.ClientId = builder.Configuration["Authentication:GitHub:ClientId"];
    options.ClientSecret = builder.Configuration["Authentication:GitHub:ClientSecret"];
    options.Scope.Add("repo");
    options.SaveTokens = true;
    options.Events.OnRemoteFailure = context =>
    {
        context.HandleResponse();
        context.Response.Redirect("http://localhost:4200/?authError=github_oauth_failed");
        return Task.CompletedTask;
    };
})
.AddGitLab("GitLab", options =>
{
    options.ClientId = builder.Configuration["Authentication:GitLab:ClientId"];
    options.ClientSecret = builder.Configuration["Authentication:GitLab:ClientSecret"];
    options.SaveTokens = true;
});
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();


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
    await context.ChallengeAsync("GitLab", new Microsoft.AspNetCore.Authentication.AuthenticationProperties { RedirectUri = "/" });
});

app.MapGet("/logout", async (HttpContext context) =>
{
    await context.SignOutAsync("Cookies");
    context.Response.Redirect("http://localhost:4200/");
});

app.MapGet("/api/auth/users", (HttpContext context) =>
{
    var isAuthenticated = context.User?.Identity?.IsAuthenticated == true;
    if (!isAuthenticated)
    {
        return Results.Ok(new { authenticated = false });
    }

    var provider = context.User?.FindFirst(ClaimTypes.AuthenticationMethod)?.Value ?? "GitHub";
    var username = context.User?.Identity?.Name
        ?? context.User?.FindFirst(ClaimTypes.Name)?.Value
        ?? context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    return Results.Ok(new
    {
        authenticated = true,
        provider,
        username
    });
});

app.Run();
