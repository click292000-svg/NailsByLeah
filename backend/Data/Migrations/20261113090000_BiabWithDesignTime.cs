using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <summary>A design adds about an hour, so BIAB with Design takes 4 hours (BIAB alone takes 3).</summary>
    public partial class BiabWithDesignTime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 6,
                column: "duration_minutes",
                value: 240);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 6,
                column: "duration_minutes",
                value: 180);
        }
    }
}
