using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SalonProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "alert_cancellation",
                table: "salon_settings",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "alert_new_booking",
                table: "salon_settings",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "alert_reschedule",
                table: "salon_settings",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "bio",
                table: "salon_settings",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "facebook_url",
                table: "salon_settings",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "instagram_handle",
                table: "salon_settings",
                type: "nvarchar(31)",
                maxLength: 31,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "instagram_url",
                table: "salon_settings",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payment_account_name",
                table: "salon_settings",
                type: "nvarchar(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone",
                table: "salon_settings",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "photo_content_type",
                table: "salon_settings",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "photo_file_name",
                table: "salon_settings",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.UpdateData(
                table: "salon_settings",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "alert_cancellation", "alert_new_booking", "alert_reschedule", "bio", "facebook_url", "instagram_handle", "instagram_url", "payment_account_name", "phone", "photo_content_type", "photo_file_name" },
                values: new object[] { true, true, true, null, null, null, null, null, null, null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "alert_cancellation",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "alert_new_booking",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "alert_reschedule",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "bio",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "facebook_url",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "instagram_handle",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "instagram_url",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "payment_account_name",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "phone",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "photo_content_type",
                table: "salon_settings");

            migrationBuilder.DropColumn(
                name: "photo_file_name",
                table: "salon_settings");
        }
    }
}
