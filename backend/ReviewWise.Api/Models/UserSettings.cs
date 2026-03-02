using System.ComponentModel.DataAnnotations;

namespace ReviewWise.Api.Models;

public class UserSettings
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Username { get; set; } = string.Empty;

    public int SchemaVersion { get; set; } = 1;

    [Required]
    public string SettingsJson { get; set; } = "{}";

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
