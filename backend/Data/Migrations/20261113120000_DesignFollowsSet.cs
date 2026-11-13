using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <summary>
    /// A "with design" version now always costs its set's price + ₱100 and takes its set's time + 1 hour. Brings any
    /// design price or time edited on its own back in line (data only; the model is unchanged).
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261113120000_DesignFollowsSet")]
    public partial class DesignFollowsSet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE services
                SET price = (SELECT s.price FROM services s WHERE s.id = services.design_option_of_id) + 100,
                    duration_minutes = (SELECT s.duration_minutes FROM services s WHERE s.id = services.design_option_of_id) + 60
                WHERE design_option_of_id IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Nothing to undo: the old prices and times were whatever had been typed in.
        }
    }
}
