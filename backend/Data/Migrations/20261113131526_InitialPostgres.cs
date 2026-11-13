using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "addons",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:IdentitySequenceOptions", "'100', '1', '', '', 'False', '1'")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_addons", x => x.id);
                    table.CheckConstraint("ck_addons_price_non_negative", "price >= 0");
                });

            migrationBuilder.CreateTable(
                name: "data_protection_keys",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    friendly_name = table.Column<string>(type: "text", nullable: true),
                    xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_protection_keys", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "gallery_photos",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    file_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    content_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    caption = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by_user_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_gallery_photos", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "salon_settings",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    closing_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    payment_account_name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    facebook_url = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    instagram_url = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    instagram_handle = table.Column<string>(type: "character varying(31)", maxLength: 31, nullable: true),
                    bio = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    photo_file_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    photo_content_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    alert_new_booking = table.Column<bool>(type: "boolean", nullable: false),
                    alert_cancellation = table.Column<bool>(type: "boolean", nullable: false),
                    alert_reschedule = table.Column<bool>(type: "boolean", nullable: false),
                    deposit_amount = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    reschedule_minimum_hours = table.Column<int>(type: "integer", nullable: true),
                    client_reschedule_limit = table.Column<int>(type: "integer", nullable: true),
                    max_days_ahead = table.Column<int>(type: "integer", nullable: true),
                    out_of_stock_colors = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_by_user_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_salon_settings", x => x.id);
                    table.CheckConstraint("ck_salon_settings_single_row", "id = 1");
                });

            migrationBuilder.CreateTable(
                name: "services",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:IdentitySequenceOptions", "'100', '1', '', '', 'False', '1'")
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    duration_minutes = table.Column<int>(type: "integer", nullable: false, defaultValue: 60),
                    allows_add_ons = table.Column<bool>(type: "boolean", nullable: false),
                    design_option_of_id = table.Column<int>(type: "integer", nullable: true),
                    category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_services", x => x.id);
                    table.CheckConstraint("ck_services_duration_range", "duration_minutes BETWEEN 15 AND 480");
                    table.CheckConstraint("ck_services_price_non_negative", "price >= 0");
                    table.ForeignKey(
                        name: "fk_services_services_design_option_of_id",
                        column: x => x.design_option_of_id,
                        principalTable: "services",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    first_name = table.Column<string>(type: "character varying(75)", maxLength: 75, nullable: false),
                    last_name = table.Column<string>(type: "character varying(75)", maxLength: 75, nullable: false),
                    username = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    username_key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, computedColumnSql: "lower(username)", stored: true),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    phone_number = table.Column<string>(type: "character varying(11)", maxLength: 11, nullable: false),
                    password_hash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    email_verified = table.Column<bool>(type: "boolean", nullable: false),
                    email_verified_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    terms_version = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    terms_accepted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    failed_login_count = table.Column<int>(type: "integer", nullable: false),
                    lockout_end_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    security_stamp = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    photo_file_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    photo_content_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    admin_note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                    table.CheckConstraint("ck_users_failed_login_count", "failed_login_count >= 0");
                    table.CheckConstraint("ck_users_first_name_length", "char_length(first_name) BETWEEN 1 AND 75");
                    table.CheckConstraint("ck_users_last_name_length", "char_length(last_name) BETWEEN 1 AND 75");
                    table.CheckConstraint("ck_users_phone_digits", "phone_number ~ '^[0-9]{11}$'");
                });

            migrationBuilder.CreateTable(
                name: "audit_logs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: true),
                    action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    entity_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    entity_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    details = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ip_address = table.Column<string>(type: "character varying(45)", maxLength: 45, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_audit_logs_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "blocked_slots",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    created_by_user_id = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blocked_slots", x => x.id);
                    table.CheckConstraint("ck_blocked_slots_period", "(start_time IS NULL AND end_time IS NULL) OR end_time > start_time");
                    table.ForeignKey(
                        name: "fk_blocked_slots_users_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "booking_drafts",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    client_id = table.Column<int>(type: "integer", nullable: false),
                    data = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_booking_drafts", x => x.id);
                    table.CheckConstraint("ck_booking_drafts_data_json", "data IS JSON");
                    table.ForeignKey(
                        name: "fk_booking_drafts_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bookings",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    client_id = table.Column<int>(type: "integer", nullable: false),
                    service_id = table.Column<int>(type: "integer", nullable: false),
                    removal_service_id = table.Column<int>(type: "integer", nullable: true),
                    removal_price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    nail_color = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    per_nail_colors = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: true),
                    color_request = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    color_request_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    reschedule_count = table.Column<int>(type: "integer", nullable: false),
                    terms_version = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    terms_accepted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    service_price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    deposit_amount = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    booking_date = table.Column<DateOnly>(type: "date", nullable: false),
                    start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    duration_minutes = table.Column<int>(type: "integer", nullable: false),
                    guest_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    guest_phone = table.Column<string>(type: "character varying(11)", maxLength: 11, nullable: true),
                    created_by_admin = table.Column<bool>(type: "boolean", nullable: false),
                    note = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reminder_sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    payment_option = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    amount_paid = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    balance_received = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    balance_received_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    balance_reference = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    refund_due = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    refund_sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    refund_reference = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    confirmed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    confirmed_by_user_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_bookings", x => x.id);
                    table.CheckConstraint("ck_bookings_amount_paid_non_negative", "amount_paid >= 0");
                    table.CheckConstraint("ck_bookings_balance_received_non_negative", "balance_received >= 0");
                    table.CheckConstraint("ck_bookings_deposit_non_negative", "deposit_amount >= 0");
                    table.CheckConstraint("ck_bookings_duration_positive", "duration_minutes > 0");
                    table.CheckConstraint("ck_bookings_refund_due_non_negative", "refund_due >= 0");
                    table.CheckConstraint("ck_bookings_removal_price_non_negative", "removal_price >= 0");
                    table.CheckConstraint("ck_bookings_service_price_non_negative", "service_price >= 0");
                    table.ForeignKey(
                        name: "fk_bookings_services_removal_service_id",
                        column: x => x.removal_service_id,
                        principalTable: "services",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_bookings_services_service_id",
                        column: x => x.service_id,
                        principalTable: "services",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_bookings_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_bookings_users_confirmed_by_user_id",
                        column: x => x.confirmed_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "feedback",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    client_id = table.Column<int>(type: "integer", nullable: false),
                    rating = table.Column<int>(type: "integer", nullable: false),
                    comment = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    submission_key = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reply = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    replied_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_feedback", x => x.id);
                    table.CheckConstraint("ck_feedback_rating", "rating BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "fk_feedback_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_tokens",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    purpose = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    consumed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    failed_attempts = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_tokens", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_tokens_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "booking_addons",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    booking_id = table.Column<int>(type: "integer", nullable: false),
                    add_on_id = table.Column<int>(type: "integer", nullable: false),
                    nail_count = table.Column<int>(type: "integer", nullable: false),
                    hand = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    line_price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_booking_addons", x => x.id);
                    table.CheckConstraint("ck_booking_addons_hand", "hand = 'Both' OR (hand IN ('Left', 'Right') AND nail_count <= 5)");
                    table.CheckConstraint("ck_booking_addons_line_price_non_negative", "line_price >= 0");
                    table.CheckConstraint("ck_booking_addons_nail_count", "nail_count BETWEEN 1 AND 10");
                    table.ForeignKey(
                        name: "fk_booking_addons_add_ons_add_on_id",
                        column: x => x.add_on_id,
                        principalTable: "addons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_booking_addons_bookings_booking_id",
                        column: x => x.booking_id,
                        principalTable: "bookings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "cancellations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    booking_id = table.Column<int>(type: "integer", nullable: false),
                    cancelled_by_user_id = table.Column<int>(type: "integer", nullable: false),
                    reason = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    explanation = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cancellations", x => x.id);
                    table.ForeignKey(
                        name: "fk_cancellations_bookings_booking_id",
                        column: x => x.booking_id,
                        principalTable: "bookings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_cancellations_users_cancelled_by_user_id",
                        column: x => x.cancelled_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    booking_id = table.Column<int>(type: "integer", nullable: false),
                    client_id = table.Column<int>(type: "integer", nullable: false),
                    method = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    option = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    total_amount = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    balance_after = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    verified_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    verified_by_user_id = table.Column<int>(type: "integer", nullable: true),
                    reference_number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    idempotency_key = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    paid_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payments", x => x.id);
                    table.CheckConstraint("ck_payments_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_payments_balance_after", "balance_after >= 0 AND total_amount >= 0");
                    table.ForeignKey(
                        name: "fk_payments_bookings_booking_id",
                        column: x => x.booking_id,
                        principalTable: "bookings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payments_users_client_id",
                        column: x => x.client_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_payments_users_verified_by_user_id",
                        column: x => x.verified_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reference_images",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    client_id = table.Column<int>(type: "integer", nullable: false),
                    booking_id = table.Column<int>(type: "integer", nullable: true),
                    stored_file_name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    content_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    is_color_reference = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reference_images", x => x.id);
                    table.CheckConstraint("ck_reference_images_content_type", "content_type IN ('image/jpeg', 'image/png', 'image/webp')");
                    table.CheckConstraint("ck_reference_images_size", "size_bytes > 0 AND size_bytes <= 5242880");
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

            migrationBuilder.InsertData(
                table: "addons",
                columns: new[] { "id", "created_at", "is_active", "is_deleted", "name", "price", "updated_at" },
                values: new object[,]
                {
                    { 1, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "French Tip", 15m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { 2, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "Chrome", 10m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { 3, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "Cat Eye Polish", 10m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { 4, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "Blooming Gel", 10m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { 5, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "Embossed Art", 15m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { 6, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, false, "Rhinestone", 15m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc) }
                });

            migrationBuilder.InsertData(
                table: "salon_settings",
                columns: new[] { "id", "alert_cancellation", "alert_new_booking", "alert_reschedule", "bio", "client_reschedule_limit", "closing_time", "deposit_amount", "facebook_url", "instagram_handle", "instagram_url", "max_days_ahead", "out_of_stock_colors", "payment_account_name", "phone", "photo_content_type", "photo_file_name", "reschedule_minimum_hours", "updated_at", "updated_by_user_id" },
                values: new object[] { 1, true, true, true, null, null, new TimeOnly(21, 0, 0), null, null, null, null, null, null, null, null, null, null, null, new DateTime(2026, 11, 2, 0, 0, 0, 0, DateTimeKind.Utc), null });

            migrationBuilder.InsertData(
                table: "services",
                columns: new[] { "id", "allows_add_ons", "created_at", "design_option_of_id", "duration_minutes", "is_active", "is_deleted", "name", "price", "updated_at", "category" },
                values: new object[,]
                {
                    { 1, false, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 120, true, false, "Plain", 300m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" },
                    { 3, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 180, true, false, "BIAB", 250m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" },
                    { 4, false, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 60, true, false, "My Work", 100m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Removal" },
                    { 5, false, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 60, true, false, "Not My Work", 150m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Removal" },
                    { 7, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 120, true, false, "Soft Gel Extension", 399m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" },
                    { 2, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), 1, 180, false, true, "With Design", 400m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" },
                    { 6, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), 3, 240, true, false, "BIAB with Design", 350m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" },
                    { 8, true, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), 7, 180, true, false, "Soft Gel Extension with Design", 499m, new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc), "SoftGel" }
                });

            migrationBuilder.CreateIndex(
                name: "ux_addons_name",
                table: "addons",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_created_at",
                table: "audit_logs",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_user_id",
                table: "audit_logs",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_blocked_slots_created_by_user_id",
                table: "blocked_slots",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_blocked_slots_date",
                table: "blocked_slots",
                column: "date");

            migrationBuilder.CreateIndex(
                name: "ix_booking_addons_add_on_id",
                table: "booking_addons",
                column: "add_on_id");

            migrationBuilder.CreateIndex(
                name: "ux_booking_addons_booking_addon",
                table: "booking_addons",
                columns: new[] { "booking_id", "add_on_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_booking_drafts_client_id",
                table: "booking_drafts",
                column: "client_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_bookings_booking_date_start_time",
                table: "bookings",
                columns: new[] { "booking_date", "start_time" });

            migrationBuilder.CreateIndex(
                name: "ix_bookings_client_id",
                table: "bookings",
                column: "client_id");

            migrationBuilder.CreateIndex(
                name: "ix_bookings_confirmed_by_user_id",
                table: "bookings",
                column: "confirmed_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_bookings_removal_service_id",
                table: "bookings",
                column: "removal_service_id");

            migrationBuilder.CreateIndex(
                name: "ix_bookings_service_id",
                table: "bookings",
                column: "service_id");

            migrationBuilder.CreateIndex(
                name: "ix_bookings_status",
                table: "bookings",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_bookings_active_slot",
                table: "bookings",
                columns: new[] { "booking_date", "start_time" },
                unique: true,
                filter: "status IN ('Pending', 'Confirmed') AND NOT is_deleted");

            migrationBuilder.CreateIndex(
                name: "ix_cancellations_cancelled_by_user_id",
                table: "cancellations",
                column: "cancelled_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_cancellations_booking_id",
                table: "cancellations",
                column: "booking_id",
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

            migrationBuilder.CreateIndex(
                name: "ix_gallery_photos_created_at",
                table: "gallery_photos",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ix_payments_booking_id",
                table: "payments",
                column: "booking_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_client_id",
                table: "payments",
                column: "client_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_paid_at",
                table: "payments",
                column: "paid_at");

            migrationBuilder.CreateIndex(
                name: "ix_payments_verified_by_user_id",
                table: "payments",
                column: "verified_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ux_payments_idempotency_key",
                table: "payments",
                column: "idempotency_key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_payments_reference_number",
                table: "payments",
                column: "reference_number",
                unique: true);

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

            migrationBuilder.CreateIndex(
                name: "ix_services_design_option_of_id",
                table: "services",
                column: "design_option_of_id");

            migrationBuilder.CreateIndex(
                name: "ux_services_category_name",
                table: "services",
                columns: new[] { "category", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_tokens_user_purpose",
                table: "user_tokens",
                columns: new[] { "user_id", "purpose" });

            migrationBuilder.CreateIndex(
                name: "ux_user_tokens_token_hash",
                table: "user_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_users_phone_number",
                table: "users",
                column: "phone_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_users_username",
                table: "users",
                column: "username_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_logs");

            migrationBuilder.DropTable(
                name: "blocked_slots");

            migrationBuilder.DropTable(
                name: "booking_addons");

            migrationBuilder.DropTable(
                name: "booking_drafts");

            migrationBuilder.DropTable(
                name: "cancellations");

            migrationBuilder.DropTable(
                name: "data_protection_keys");

            migrationBuilder.DropTable(
                name: "feedback");

            migrationBuilder.DropTable(
                name: "gallery_photos");

            migrationBuilder.DropTable(
                name: "payments");

            migrationBuilder.DropTable(
                name: "reference_images");

            migrationBuilder.DropTable(
                name: "salon_settings");

            migrationBuilder.DropTable(
                name: "user_tokens");

            migrationBuilder.DropTable(
                name: "addons");

            migrationBuilder.DropTable(
                name: "bookings");

            migrationBuilder.DropTable(
                name: "services");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
