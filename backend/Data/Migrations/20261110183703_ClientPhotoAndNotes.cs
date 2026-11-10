using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ClientPhotoAndNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "reminder_emails",
                table: "users");

            // The favourite shade is gone; the photo type is a new, empty column (not the old one renamed).
            migrationBuilder.DropColumn(
                name: "favorite_color",
                table: "users");

            migrationBuilder.AddColumn<string>(
                name: "photo_content_type",
                table: "users",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "nail_notes",
                table: "users",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "photo_file_name",
                table: "users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "nail_notes",
                table: "users");

            migrationBuilder.DropColumn(
                name: "photo_file_name",
                table: "users");

            migrationBuilder.DropColumn(
                name: "photo_content_type",
                table: "users");

            migrationBuilder.AddColumn<string>(
                name: "favorite_color",
                table: "users",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "reminder_emails",
                table: "users",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }
    }
}
