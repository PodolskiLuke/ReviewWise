using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using ReviewWise.Api.Controllers;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;
using Xunit;

namespace ReviewWise.Api.Tests.Controllers;

public class UsersControllerTests
{
    [Fact]
    public void GetUsers_ReturnsAllUsersFromDatabase()
    {
        using var db = CreateDb();
        db.Users.AddRange(
            new User { Username = "alice", Email = "alice@example.com" },
            new User { Username = "bob", Email = "bob@example.com" }
        );
        db.SaveChanges();

        var controller = new UsersController(db, NullLogger<UsersController>.Instance);

        var result = controller.GetUsers();

        var ok = Assert.IsType<OkObjectResult>(result);
        var users = Assert.IsAssignableFrom<IEnumerable<User>>(ok.Value);
        Assert.Equal(2, users.Count());
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"users-controller-tests-{Guid.NewGuid():N}")
            .Options;

        return new AppDbContext(options);
    }
}
