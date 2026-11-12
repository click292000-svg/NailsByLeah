using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ClientRevisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "design_option_of_id",
                table: "services",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_color_reference",
                table: "reference_images",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "color_request",
                table: "bookings",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "color_request_status",
                table: "bookings",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "per_nail_colors",
                table: "bookings",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "reschedule_count",
                table: "bookings",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.InsertData(
                table: "addons",
                columns: new[] { "id", "created_at", "is_active", "is_deleted", "name", "price", "updated_at" },
                values: new object[] { 6, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "Rhinestone", 15m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) });

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 1,
                column: "design_option_of_id",
                value: null);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 2,
                column: "design_option_of_id",
                value: 1);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 3,
                column: "design_option_of_id",
                value: null);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 4,
                column: "design_option_of_id",
                value: null);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 5,
                column: "design_option_of_id",
                value: null);

            migrationBuilder.InsertData(
                table: "services",
                columns: new[] { "id", "allows_add_ons", "created_at", "design_option_of_id", "duration_minutes", "is_active", "is_deleted", "name", "price", "updated_at", "category" },
                values: new object[,]
                {
                    { 6, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), 3, 180, true, false, "BIAB with Design", 350m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" },
                    { 7, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 120, true, false, "Soft Gel Extension", 399m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" }
                });

            migrationBuilder.CreateIndex(
                name: "ix_services_design_option_of_id",
                table: "services",
                column: "design_option_of_id");

            migrationBuilder.AddForeignKey(
                name: "fk_services_services_design_option_of_id",
                table: "services",
                column: "design_option_of_id",
                principalTable: "services",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_services_services_design_option_of_id",
                table: "services");

            migrationBuilder.DropIndex(
                name: "ix_services_design_option_of_id",
                table: "services");

            migrationBuilder.DeleteData(
                table: "addons",
                keyColumn: "id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "services",
                keyColumn: "id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "services",
                keyColumn: "id",
                keyValue: 7);

            migrationBuilder.DropColumn(
                name: "design_option_of_id",
                table: "services");

            migrationBuilder.DropColumn(
                name: "is_color_reference",
                table: "reference_images");

            migrationBuilder.DropColumn(
                name: "color_request",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "color_request_status",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "per_nail_colors",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "reschedule_count",
                table: "bookings");
        }
    }
}
