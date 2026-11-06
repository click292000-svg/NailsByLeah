using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NoShowAndBalanceReceived : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "balance_received",
                table: "bookings",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "balance_received_at",
                table: "bookings",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "balance_reference",
                table: "bookings",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_bookings_balance_received_non_negative",
                table: "bookings",
                sql: "[balance_received] >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_bookings_balance_received_non_negative",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "balance_received",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "balance_received_at",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "balance_reference",
                table: "bookings");
        }
    }
}
