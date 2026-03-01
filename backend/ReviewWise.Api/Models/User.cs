using System.ComponentModel.DataAnnotations;

namespace ReviewWise.Api.Models
{
    public class User
    {
        [Key]
        public int Id { get; set; }
        [Required]
        public string Username { get; set; } = string.Empty;
        public string? Email { get; set; }
    }
}
