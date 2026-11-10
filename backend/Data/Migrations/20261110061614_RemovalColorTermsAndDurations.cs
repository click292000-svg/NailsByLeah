using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemovalColorTermsAndDurations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "allows_add_ons",
                table: "services",
                type: "bit",
                nullable: false,
                defaultValue: true); // services Leyah added herself keep taking add-ons, as before

            migrationBuilder.AddColumn<string>(
                name: "nail_color",
                table: "bookings",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "removal_price",
                table: "bookings",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "removal_service_id",
                table: "bookings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "terms_accepted_at",
                table: "bookings",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "terms_version",
                table: "bookings",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "allows_add_ons", "duration_minutes" },
                values: new object[] { false, 120 });

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "allows_add_ons", "duration_minutes" },
                values: new object[] { true, 180 });

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "allows_add_ons", "duration_minutes" },
                values: new object[] { true, 180 });

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 4,
                columns: new[] { "allows_add_ons", "duration_minutes" },
                values: new object[] { false, 60 });

            migrationBuilder.UpdateData(
                table: "services",
                keyColumn: "id",
                keyValue: 5,
                columns: new[] { "allows_add_ons", "duration_minutes" },
                values: new object[] { false, 60 });

            migrationBuilder.CreateIndex(
                name: "ix_bookings_removal_service_id",
                table: "bookings",
                column: "removal_service_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_bookings_removal_price_non_negative",
                table: "bookings",
                sql: "[removal_price] >= 0");

            migrationBuilder.AddForeignKey(
                name: "fk_bookings_services_removal_service_id",
                table: "bookings",
                column: "removal_service_id",
                principalTable: "services",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_bookings_services_removal_service_id",
                table: "bookings");

            migrationBuilder.DropIndex(
                name: "ix_bookings_removal_service_id",
                table: "bookings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_bookings_removal_price_non_negative",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "allows_add_ons",
                table: "services");

            migrationBuilder.DropColumn(
                name: "nail_color",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "removal_price",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "removal_service_id",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "terms_accepted_at",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "terms_version",
                table: "bookings");

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
        }
    }
}
