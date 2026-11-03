using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveChatAndOldNoteField : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "chat_messages");

            migrationBuilder.DropTable(
                name: "conversations");

            // Bookings made with the earlier pick-one note keep it, as typed-note text, before the column goes.
            migrationBuilder.Sql("""
                UPDATE bookings SET note = CASE note_for_leah
                    WHEN 'FirstVisit' THEN N'This is my first visit'
                    WHEN 'BringingReferencePhoto' THEN N'I''ll bring a reference photo'
                    WHEN 'KeepNailsShort' THEN N'Please keep my nails short'
                    WHEN 'KeepNailsLong' THEN N'I''d like long nails'
                    WHEN 'SensitiveSkin' THEN N'I have sensitive skin or allergies'
                END
                WHERE note IS NULL AND note_for_leah <> 'None';
                """);

            migrationBuilder.DropColumn(
                name: "note_for_leah",
                table: "bookings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "note_for_leah",
                table: "bookings",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.CreateTable(
                name: "conversations",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    booking_id = table.Column<int>(type: "int", nullable: true),
                    client_id = table.Column<int>(type: "int", nullable: false),
                    admin_last_read_message_id = table.Column<int>(type: "int", nullable: false),
                    client_last_read_message_id = table.Column<int>(type: "int", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    is_deleted = table.Column<bool>(type: "bit", nullable: false),
                    last_message_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    topic = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false)
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
        }
    }
}
