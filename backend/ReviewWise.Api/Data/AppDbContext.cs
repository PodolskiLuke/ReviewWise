using Microsoft.EntityFrameworkCore;
using ReviewWise.Api.Models;

namespace ReviewWise.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users { get; set; }
        public DbSet<ReviewResult> ReviewResults { get; set; }
    }
}
