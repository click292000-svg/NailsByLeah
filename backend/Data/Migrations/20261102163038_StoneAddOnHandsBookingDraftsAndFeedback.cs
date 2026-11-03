using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class StoneAddOnHandsBookingDraftsAndFeedback : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add-ons booked before hands were asked for count as both hands.
            migrationBuilder.AddColumn<string>(
                name: "hand",
                table: "booking_addons",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "Both");

            migrationBuilder.CreateTable(
                name: "booking_drafts",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    client_id = table.Column<int>(type: "int", nullable: false),
                    data = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_booking_drafts", x => x.id);
                    table.CheckConstraint("ck_booking_drafts_data_json", "ISJSON([data]) = 1");
                    table.ForeignKey(
                        name: "fk_booking_drafts_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "feedback",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    client_id = table.Column<int>(type: "int", nullable: false),
                    rating = table.Column<int>(type: "int", nullable: false),
                    comment = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    submission_key = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_feedback", x => x.id);
                    table.CheckConstraint("ck_feedback_rating", "[rating] BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "fk_feedback_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_booking_addons_hand",
                table: "booking_addons",
                sql: "[hand] = 'Both' OR ([hand] IN ('Left', 'Right') AND [nail_count] <= 5)");

            migrationBuilder.CreateIndex(
                name: "ux_booking_drafts_client_id",
                table: "booking_drafts",
                column: "client_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_feedback_client_id",
                table: "feedback",
                column: "client_id");

            migrationBuilder.CreateIndex(
                name: "ix_feedback_created_at",
                table: "feedback",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ux_feedback_submission_key",
                table: "feedback",
                column: "submission_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "booking_drafts");

            migrationBuilder.DropTable(
                name: "feedback");

            migrationBuilder.DropCheckConstraint(
                name: "ck_booking_addons_hand",
                table: "booking_addons");

            migrationBuilder.DropColumn(
                name: "hand",
                table: "booking_addons");
        }
    }
}
