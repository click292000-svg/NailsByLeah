using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WorkingHoursDurationsAndBreaks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "duration_minutes",
                table: "services",
                type: "int",
                nullable: false,
                defaultValue: 60);

            // Bookings made before this change were fixed 2-hour slots.
            migrationBuilder.AddColumn<int>(
                name: "duration_minutes",
                table: "bookings",
                type: "int",
                nullable: false,
                defaultValue: 120);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "end_time",
                table: "blocked_slots",
                type: "time",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "salon_settings",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false),
                    closing_time = table.Column<TimeOnly>(type: "time", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    updated_by_user_id = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_salon_settings", x => x.id);
                    table.CheckConstraint("ck_salon_settings_single_row", "[id] = 1");
                });

            migrationBuilder.InsertData(
                table: "salon_settings",
                columns: new[] { "id", "closing_time", "updated_at", "updated_by_user_id" },
                values: new object[] { 1, new TimeOnly(21, 0, 0), new DateTime(2026, 11, 2, 0, 0, 0, 0, DateTimeKind.Utc), null });

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 1,
                column: "duration_minutes",
                value: 60);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 2,
                column: "duration_minutes",
                value: 90);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 3,
                column: "duration_minutes",
                value: 60);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 4,
                column: "duration_minutes",
                value: 30);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 5,
                column: "duration_minutes",
                value: 45);

            migrationBuilder.AddCheckConstraint(
                name: "ck_services_duration_range",
                table: "services",
                sql: "[duration_minutes] BETWEEN 15 AND 480");

            migrationBuilder.AddCheckConstraint(
                name: "ck_bookings_duration_positive",
                table: "bookings",
                sql: "[duration_minutes] > 0");

            // Single blocked slots made before this change covered one 2-hour slot.
            migrationBuilder.Sql("UPDATE blocked_slots SET end_time = DATEADD(MINUTE, 120, start_time) WHERE start_time IS NOT NULL AND end_time IS NULL;");

            migrationBuilder.AddCheckConstraint(
                name: "ck_blocked_slots_period",
                table: "blocked_slots",
                sql: "([start_time] IS NULL AND [end_time] IS NULL) OR [end_time] > [start_time]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "salon_settings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_services_duration_range",
                table: "services");

            migrationBuilder.DropCheckConstraint(
                name: "ck_bookings_duration_positive",
                table: "bookings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_blocked_slots_period",
                table: "blocked_slots");

            migrationBuilder.DropColumn(
                name: "duration_minutes",
                table: "services");

            migrationBuilder.DropColumn(
                name: "duration_minutes",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "end_time",
                table: "blocked_slots");
        }
    }
}
