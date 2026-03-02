using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;

namespace ReviewWise.Api.Controllers;

[ApiController]
[Route("api/user-settings")]
public class UserSettingsController : ControllerBase
{
    private static readonly HashSet<string> AllowedDepths = new(StringComparer.OrdinalIgnoreCase)
    {
        "quick", "standard", "deep"
    };

    private static readonly HashSet<string> AllowedFocusAreas = new(StringComparer.OrdinalIgnoreCase)
    {
        "bugs", "security", "quality", "performance", "maintainability"
    };

    private static readonly HashSet<string> AllowedOutputLengths = new(StringComparer.OrdinalIgnoreCase)
    {
        "short", "medium", "long"
    };

    private readonly AppDbContext _db;
    private readonly ILogger<UserSettingsController> _logger;

    public UserSettingsController(AppDbContext db, ILogger<UserSettingsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var username = GetAuthenticatedUsername();
        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        var settingsEntity = await _db.UserSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Username == username);
        if (settingsEntity is null)
        {
            var defaults = CreateDefaultSettings();
            _logger.LogInformation("Returning default settings for user {Username}.", username);
            return Ok(new { settings = defaults });
        }

        try
        {
            var settings = JsonSerializer.Deserialize<UserSettingsDocument>(settingsEntity.SettingsJson) ?? CreateDefaultSettings();
            settings.UpdatedAt = settingsEntity.UpdatedAtUtc;
            settings.SchemaVersion = settingsEntity.SchemaVersion;

            return Ok(new { settings });
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Stored settings JSON was invalid for user {Username}; returning defaults.", username);
            var defaults = CreateDefaultSettings();
            return Ok(new { settings = defaults });
        }
    }

    [Authorize]
    [HttpPut]
    public async Task<IActionResult> Put([FromBody] UpdateUserSettingsRequest? request)
    {
        var username = GetAuthenticatedUsername();
        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        if (request?.Settings is null)
        {
            return BadRequest(new
            {
                message = "Validation failed.",
                errors = new Dictionary<string, string[]>
                {
                    ["settings"] = ["Settings payload is required."]
                }
            });
        }

        var normalized = Normalize(request.Settings);
        var errors = Validate(normalized);
        if (errors.Count > 0)
        {
            return BadRequest(new
            {
                message = "Validation failed.",
                errors
            });
        }

        var utcNow = DateTime.UtcNow;
        normalized.UpdatedAt = utcNow;

        var serialized = JsonSerializer.Serialize(normalized);
        var existing = await _db.UserSettings.FirstOrDefaultAsync(s => s.Username == username);
        if (existing is null)
        {
            existing = new UserSettings
            {
                Username = username,
                SchemaVersion = normalized.SchemaVersion,
                SettingsJson = serialized,
                UpdatedAtUtc = utcNow
            };

            _db.UserSettings.Add(existing);
        }
        else
        {
            existing.SchemaVersion = normalized.SchemaVersion;
            existing.SettingsJson = serialized;
            existing.UpdatedAtUtc = utcNow;
        }

        await _db.SaveChangesAsync();

        return Ok(new { settings = normalized });
    }

    private string? GetAuthenticatedUsername()
    {
        return User.Identity?.Name
               ?? User.FindFirstValue(ClaimTypes.Name)
               ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
    }

    private static UserSettingsDocument CreateDefaultSettings()
    {
        return new UserSettingsDocument
        {
            SchemaVersion = 1,
            Profile = new ProfileSettings
            {
                DisplayName = null,
                Timezone = null
            },
            ReviewPreferences = new ReviewPreferencesSettings
            {
                Depth = "standard",
                FocusAreas = ["bugs", "security", "quality"],
                OutputLength = "medium",
                AutoLoadLatestReview = true,
                AutoGenerateWhenMissing = true
            },
            RepositoryPreferences = new RepositoryPreferencesSettings
            {
                DefaultRepository = null,
                ExcludedRepositories = []
            },
            UiPreferences = new UiPreferencesSettings
            {
                ShowCooldownHints = true
            },
            UpdatedAt = null
        };
    }

    private static UserSettingsDocument Normalize(UserSettingsDocument input)
    {
        var normalized = new UserSettingsDocument
        {
            SchemaVersion = input.SchemaVersion <= 0 ? 1 : input.SchemaVersion,
            Profile = new ProfileSettings
            {
                DisplayName = NormalizeOptional(input.Profile?.DisplayName),
                Timezone = NormalizeOptional(input.Profile?.Timezone)
            },
            ReviewPreferences = new ReviewPreferencesSettings
            {
                Depth = NormalizeOptional(input.ReviewPreferences?.Depth) ?? "standard",
                FocusAreas = (input.ReviewPreferences?.FocusAreas ?? [])
                    .Where(area => !string.IsNullOrWhiteSpace(area))
                    .Select(area => area.Trim().ToLowerInvariant())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                OutputLength = NormalizeOptional(input.ReviewPreferences?.OutputLength) ?? "medium",
                AutoLoadLatestReview = input.ReviewPreferences?.AutoLoadLatestReview ?? true,
                AutoGenerateWhenMissing = input.ReviewPreferences?.AutoGenerateWhenMissing ?? true
            },
            RepositoryPreferences = new RepositoryPreferencesSettings
            {
                DefaultRepository = NormalizeRepository(input.RepositoryPreferences?.DefaultRepository),
                ExcludedRepositories = (input.RepositoryPreferences?.ExcludedRepositories ?? [])
                    .Select(NormalizeRepository)
                    .Where(repo => repo is not null)
                    .DistinctBy(repo => $"{repo!.Owner}/{repo.Name}", StringComparer.OrdinalIgnoreCase)
                    .Cast<RepositoryRef>()
                    .ToList()
            },
            UiPreferences = new UiPreferencesSettings
            {
                ShowCooldownHints = input.UiPreferences?.ShowCooldownHints ?? true
            },
            UpdatedAt = input.UpdatedAt
        };

        return normalized;
    }

    private static Dictionary<string, string[]> Validate(UserSettingsDocument settings)
    {
        var errors = new Dictionary<string, List<string>>();

        if (!string.IsNullOrWhiteSpace(settings.Profile?.DisplayName) && settings.Profile.DisplayName.Length > 80)
        {
            AddError(errors, "profile.displayName", "Display name must be 80 characters or fewer.");
        }

        if (!string.IsNullOrWhiteSpace(settings.Profile?.Timezone) && settings.Profile.Timezone.Length > 64)
        {
            AddError(errors, "profile.timezone", "Timezone must be 64 characters or fewer.");
        }

        if (!AllowedDepths.Contains(settings.ReviewPreferences.Depth))
        {
            AddError(errors, "reviewPreferences.depth", "Depth must be one of: quick, standard, deep.");
        }

        if (!AllowedOutputLengths.Contains(settings.ReviewPreferences.OutputLength))
        {
            AddError(errors, "reviewPreferences.outputLength", "Output length must be one of: short, medium, long.");
        }

        if (settings.ReviewPreferences.FocusAreas.Count > 5)
        {
            AddError(errors, "reviewPreferences.focusAreas", "Focus areas can contain at most 5 items.");
        }

        foreach (var area in settings.ReviewPreferences.FocusAreas)
        {
            if (!AllowedFocusAreas.Contains(area))
            {
                AddError(errors, "reviewPreferences.focusAreas", $"Contains invalid focus area: {area}.");
            }
        }

        if (settings.RepositoryPreferences.ExcludedRepositories.Count > 100)
        {
            AddError(errors, "repositoryPreferences.excludedRepositories", "Excluded repositories can contain at most 100 items.");
        }

        foreach (var repo in settings.RepositoryPreferences.ExcludedRepositories)
        {
            if (string.IsNullOrWhiteSpace(repo.Owner) || string.IsNullOrWhiteSpace(repo.Name))
            {
                AddError(errors, "repositoryPreferences.excludedRepositories", "Each excluded repository must include owner and name.");
            }
        }

        if (settings.RepositoryPreferences.DefaultRepository is not null)
        {
            if (string.IsNullOrWhiteSpace(settings.RepositoryPreferences.DefaultRepository.Owner) ||
                string.IsNullOrWhiteSpace(settings.RepositoryPreferences.DefaultRepository.Name))
            {
                AddError(errors, "repositoryPreferences.defaultRepository", "Default repository must include owner and name.");
            }

            var isExcluded = settings.RepositoryPreferences.ExcludedRepositories.Any(repo =>
                repo.Owner.Equals(settings.RepositoryPreferences.DefaultRepository.Owner, StringComparison.OrdinalIgnoreCase)
                && repo.Name.Equals(settings.RepositoryPreferences.DefaultRepository.Name, StringComparison.OrdinalIgnoreCase));

            if (isExcluded)
            {
                AddError(errors, "repositoryPreferences.defaultRepository", "Default repository cannot also be excluded.");
            }
        }

        return errors.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.ToArray());
    }

    private static void AddError(Dictionary<string, List<string>> errors, string key, string message)
    {
        if (!errors.TryGetValue(key, out var list))
        {
            list = [];
            errors[key] = list;
        }

        list.Add(message);
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static RepositoryRef? NormalizeRepository(RepositoryRef? repo)
    {
        if (repo is null)
        {
            return null;
        }

        var owner = NormalizeOptional(repo.Owner);
        var name = NormalizeOptional(repo.Name);
        if (owner is null || name is null)
        {
            return null;
        }

        return new RepositoryRef { Owner = owner, Name = name };
    }
}

public class UpdateUserSettingsRequest
{
    public UserSettingsDocument? Settings { get; set; }
}

public class UserSettingsDocument
{
    public int SchemaVersion { get; set; } = 1;
    public ProfileSettings Profile { get; set; } = new();
    public ReviewPreferencesSettings ReviewPreferences { get; set; } = new();
    public RepositoryPreferencesSettings RepositoryPreferences { get; set; } = new();
    public UiPreferencesSettings UiPreferences { get; set; } = new();
    public DateTime? UpdatedAt { get; set; }
}

public class ProfileSettings
{
    public string? DisplayName { get; set; }
    public string? Timezone { get; set; }
}

public class ReviewPreferencesSettings
{
    public string Depth { get; set; } = "standard";
    public List<string> FocusAreas { get; set; } = ["bugs", "security", "quality"];
    public string OutputLength { get; set; } = "medium";
    public bool AutoLoadLatestReview { get; set; } = true;
    public bool AutoGenerateWhenMissing { get; set; } = true;
}

public class RepositoryPreferencesSettings
{
    public RepositoryRef? DefaultRepository { get; set; }
    public List<RepositoryRef> ExcludedRepositories { get; set; } = [];
}

public class RepositoryRef
{
    public string Owner { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class UiPreferencesSettings
{
    public bool ShowCooldownHints { get; set; } = true;
}
