using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <summary>
    /// Only Soft Gel Extension and BIAB take a design: Plain's "With Design" is retired (kept for the bookings made with
    /// it) and "Soft Gel Extension with Design" (₱399 + ₱100, 2 hours + 1) is added.
    /// </summary>
    public partial class DesignOnSoftGelExtension : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "is_active", "is_deleted" },
                values: new object[] { false, true });

            migrationBuilder.InsertData(
                table: "services",
                columns: new[] { "id", "allows_add_ons", "created_at", "design_option_of_id", "duration_minutes", "is_active", "is_deleted", "name", "price", "updated_at", "category" },
                values: new object[] { 8, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), 7, 180, true, false, "Soft Gel Extension with Design", 499m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "services",
                keyColumn: "id",
                keyValue: 8);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "is_active", "is_deleted" },
                values: new object[] { true, false });
        }
    }
}
