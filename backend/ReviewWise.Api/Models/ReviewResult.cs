using System;
using System.ComponentModel.DataAnnotations;

namespace ReviewWise.Api.Models
{
    public class ReviewResult
    {
        [Key]
        public int Id { get; set; }
        public string Owner { get; set; } = string.Empty;
        public string Repo { get; set; } = string.Empty;
        public int PrNumber { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Review { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
