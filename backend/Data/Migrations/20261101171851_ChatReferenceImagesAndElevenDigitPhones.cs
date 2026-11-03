using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ChatReferenceImagesAndElevenDigitPhones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_users_phone_digits",
                table: "users");

            migrationBuilder.AlterColumn<string>(
                name: "phone_number",
                table: "users",
                type: "nvarchar(11)",
                maxLength: 11,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(15)",
                oldMaxLength: 15);

            migrationBuilder.CreateTable(
                name: "conversations",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    client_id = table.Column<int>(type: "int", nullable: false),
                    topic = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    booking_id = table.Column<int>(type: "int", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    last_message_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    client_last_read_message_id = table.Column<int>(type: "int", nullable: false),
                    admin_last_read_message_id = table.Column<int>(type: "int", nullable: false),
                    is_deleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversations", x => x.id);
                    table.CheckConstraint("ck_conversations_booking_topic", "[booking_id] IS NULL OR [topic] = 'Booking'");
                    table.CheckConstraint("ck_conversations_read_ids", "[client_last_read_message_id] >= 0 AND [admin_last_read_message_id] >= 0");
                    table.ForeignKey(
                        name: "fk_conversations_bookings_booking_id",
                        column: x => x.booking_id,
                        principalTable: "bookings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_conversations_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reference_images",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    client_id = table.Column<int>(type: "int", nullable: false),
                    booking_id = table.Column<int>(type: "int", nullable: true),
                    stored_file_name = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    content_type = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    is_deleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reference_images", x => x.id);
                    table.CheckConstraint("ck_reference_images_content_type", "[content_type] IN ('image/jpeg', 'image/png', 'image/webp')");
                    table.CheckConstraint("ck_reference_images_size", "[size_bytes] > 0 AND [size_bytes] <= 5242880");
                    table.ForeignKey(
                        name: "fk_reference_images_bookings_booking_id",
                        column: x => x.booking_id,
                        principalTable: "bookings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_reference_images_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_messages",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    conversation_id = table.Column<int>(type: "int", nullable: false),
                    sender_id = table.Column<int>(type: "int", nullable: false),
                    body = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_chat_messages", x => x.id);
                    table.CheckConstraint("ck_chat_messages_body_length", "LEN([body]) BETWEEN 1 AND 1000");
                    table.ForeignKey(
                        name: "fk_chat_messages_conversations_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "conversations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_chat_messages_users_sender_id",
                        column: x => x.sender_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_users_phone_digits",
                table: "users",
                sql: "[phone_number] NOT LIKE '%[^0-9]%' AND LEN([phone_number]) = 11");

            migrationBuilder.CreateIndex(
                name: "ix_chat_messages_conversation_id",
                table: "chat_messages",
                columns: new[] { "conversation_id", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_chat_messages_sender_id",
                table: "chat_messages",
                column: "sender_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversations_booking_id",
                table: "conversations",
                column: "booking_id");

            migrationBuilder.CreateIndex(
                name: "ix_conversations_client_last_message",
                table: "conversations",
                columns: new[] { "client_id", "last_message_at" });

            migrationBuilder.CreateIndex(
                name: "ix_conversations_last_message_at",
                table: "conversations",
                column: "last_message_at");

            migrationBuilder.CreateIndex(
                name: "ix_reference_images_booking_id",
                table: "reference_images",
                column: "booking_id");

            migrationBuilder.CreateIndex(
                name: "ix_reference_images_client_booking",
                table: "reference_images",
                columns: new[] { "client_id", "booking_id" });

            migrationBuilder.CreateIndex(
                name: "ux_reference_images_stored_file_name",
                table: "reference_images",
                column: "stored_file_name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "chat_messages");

            migrationBuilder.DropTable(
                name: "reference_images");

            migrationBuilder.DropTable(
                name: "conversations");

            migrationBuilder.DropCheckConstraint(
                name: "ck_users_phone_digits",
                table: "users");

            migrationBuilder.AlterColumn<string>(
                name: "phone_number",
                table: "users",
                type: "nvarchar(15)",
                maxLength: 15,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(11)",
                oldMaxLength: 11);

            migrationBuilder.AddCheckConstraint(
                name: "ck_users_phone_digits",
                table: "users",
                sql: "[phone_number] NOT LIKE '%[^0-9]%' AND LEN([phone_number]) BETWEEN 7 AND 15");
        }
    }
}
