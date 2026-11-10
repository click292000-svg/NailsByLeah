using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RefundDue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "refund_due",
                table: "bookings",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "refund_reference",
                table: "bookings",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "refund_sent_at",
                table: "bookings",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_bookings_refund_due_non_negative",
                table: "bookings",
                sql: "[refund_due] >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_bookings_refund_due_non_negative",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "refund_due",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "refund_reference",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "refund_sent_at",
                table: "bookings");
        }
    }
}
