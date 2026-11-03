using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DepositOrFullPaymentAndAdminConfirmation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "balance_after",
                table: "payments",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "client_id",
                table: "payments",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Every payment before this change was a deposit.
            migrationBuilder.AddColumn<string>(
                name: "option",
                table: "payments",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "Deposit");

            migrationBuilder.AddColumn<decimal>(
                name: "total_amount",
                table: "payments",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "verified_at",
                table: "payments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "verified_by_user_id",
                table: "payments",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "amount_paid",
                table: "bookings",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "confirmed_at",
                table: "bookings",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "confirmed_by_user_id",
                table: "bookings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payment_option",
                table: "bookings",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "Deposit");

            // Existing records: payments belong to their booking's client and record the booking total and what was
            // left after the deposit; bookings record what was paid. Done before the foreign keys and checks below.
            migrationBuilder.Sql("""
                UPDATE p SET
                    p.client_id = b.client_id,
                    p.total_amount = t.total,
                    p.balance_after = CASE WHEN t.total > p.amount THEN t.total - p.amount ELSE 0 END
                FROM payments p
                JOIN bookings b ON b.id = p.booking_id
                CROSS APPLY (SELECT b.service_price + ISNULL((SELECT SUM(a.line_price) FROM booking_addons a WHERE a.booking_id = b.id), 0) AS total) t;

                UPDATE b SET b.amount_paid = ISNULL((SELECT SUM(p.amount) FROM payments p WHERE p.booking_id = b.id AND p.status = 'Succeeded'), 0)
                FROM bookings b;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_payments_client_id",
                table: "payments",
                column: "client_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_verified_by_user_id",
                table: "payments",
                column: "verified_by_user_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_payments_balance_after",
                table: "payments",
                sql: "[balance_after] >= 0 AND [total_amount] >= 0");

            migrationBuilder.CreateIndex(
                name: "ix_bookings_confirmed_by_user_id",
                table: "bookings",
                column: "confirmed_by_user_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_bookings_amount_paid_non_negative",
                table: "bookings",
                sql: "[amount_paid] >= 0");

            migrationBuilder.AddForeignKey(
                name: "fk_bookings_users_confirmed_by_user_id",
                table: "bookings",
                column: "confirmed_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_payments_users_client_id",
                table: "payments",
                column: "client_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_payments_users_verified_by_user_id",
                table: "payments",
                column: "verified_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_bookings_users_confirmed_by_user_id",
                table: "bookings");

            migrationBuilder.DropForeignKey(
                name: "fk_payments_users_client_id",
                table: "payments");

            migrationBuilder.DropForeignKey(
                name: "fk_payments_users_verified_by_user_id",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "ix_payments_client_id",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "ix_payments_verified_by_user_id",
                table: "payments");

            migrationBuilder.DropCheckConstraint(
                name: "ck_payments_balance_after",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "ix_bookings_confirmed_by_user_id",
                table: "bookings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_bookings_amount_paid_non_negative",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "balance_after",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "client_id",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "option",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "total_amount",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "verified_at",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "verified_by_user_id",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "amount_paid",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "confirmed_at",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "confirmed_by_user_id",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "payment_option",
                table: "bookings");
        }
    }
}
