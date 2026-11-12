using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AdminFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "admin_note",
                table: "users",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "client_reschedule_limit",
                table: "salon_settings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "deposit_amount",
                table: "salon_settings",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "max_days_ahead",
                table: "salon_settings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "out_of_stock_colors",
                table: "salon_settings",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "reschedule_minimum_hours",
                table: "salon_settings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "replied_at",
                table: "feedback",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "reply",
                table: "feedback",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "created_by_admin",
                table: "bookings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "guest_name",
                table: "bookings",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "guest_phone",
                table: "bookings",
                type: "nvarchar(11)",
                maxLength: 11,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "gallery_photos",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    file_name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    content_type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    caption = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    created_by_user_id = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_gallery_photos", x => x.id);
                });

            migrationBuilder.UpdateData(
                table: "salon_settings",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "client_reschedule_limit", "deposit_amount", "max_days_ahead", "out_of_stock_colors", "reschedule_minimum_hours" },
                values: new object[] { null, null, null, null, null });

            migrationBuilder.CreateIndex(
                name: "ix_gallery_photos_created_at",
                table: "gallery_photos",
                column: "created_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "gallery_photos");

            migrationBuilder.DropColumn(
                name: "admin_note",
                table: "users");

            migrationBuilder.DropColumn(
                name: "client_reschedule_limit",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "deposit_amount",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "max_days_ahead",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "out_of_stock_colors",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "reschedule_minimum_hours",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "replied_at",
                table: "feedback");

            migrationBuilder.DropColumn(
                name: "reply",
                table: "feedback");

            migrationBuilder.DropColumn(
                name: "created_by_admin",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "guest_name",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "guest_phone",
                table: "bookings");
        }
    }
}
