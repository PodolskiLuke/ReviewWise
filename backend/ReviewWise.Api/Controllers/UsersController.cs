using Microsoft.AspNetCore.Mvc;
using ReviewWise.Api.Data;
using ReviewWise.Api.Models;

namespace ReviewWise.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<UsersController> _logger;

        public UsersController(AppDbContext context, ILogger<UsersController> logger)
        {
            _context = context;
            _logger = logger;
        }

        [HttpGet]
        public IActionResult GetUsers()
        {
            var users = _context.Users.ToList();
            _logger.LogInformation("Returning {UserCount} users from local database.", users.Count);
            return Ok(users);
        }
    }
}
