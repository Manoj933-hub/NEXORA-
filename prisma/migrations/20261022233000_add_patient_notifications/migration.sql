-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('APPOINTMENT_BOOKED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_REMINDER', 'PRESCRIPTION_READY', 'PAYMENT_RECEIPT', 'INVOICE_ISSUED', 'GENERAL_ANNOUNCEMENT');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "sms_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsapp_consent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "clinic_notification_settings" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "appointment_alerts" BOOLEAN NOT NULL DEFAULT true,
    "prescription_alerts" BOOLEAN NOT NULL DEFAULT true,
    "billing_alerts" BOOLEAN NOT NULL DEFAULT true,
    "sender_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "prescription_id" TEXT,
    "invoice_id" TEXT,
    "payment_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "message_body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_message_id" TEXT,
    "provider_name" TEXT NOT NULL DEFAULT 'MOCK',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secure_document_links" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_document_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_notification_settings_clinic_id_key" ON "clinic_notification_settings"("clinic_id");

-- CreateIndex
CREATE INDEX "notification_logs_clinic_id_created_at_idx" ON "notification_logs"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_clinic_id_patient_id_idx" ON "notification_logs"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "notification_logs_clinic_id_status_idx" ON "notification_logs"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "notification_logs_clinic_id_event_type_idx" ON "notification_logs"("clinic_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "secure_document_links_token_hash_key" ON "secure_document_links"("token_hash");

-- CreateIndex
CREATE INDEX "secure_document_links_clinic_id_resource_id_idx" ON "secure_document_links"("clinic_id", "resource_id");

-- AddForeignKey
ALTER TABLE "clinic_notification_settings" ADD CONSTRAINT "clinic_notification_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_document_links" ADD CONSTRAINT "secure_document_links_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_document_links" ADD CONSTRAINT "secure_document_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
