-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "diagnoses" ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "consultation_versions" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ConsultationStatus" NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "observations_snapshot" JSONB,
    "diagnoses_snapshot" JSONB,
    "prescriptions_snapshot" JSONB,
    "finalized_at" TIMESTAMP(3),
    "amended_at" TIMESTAMP(3),
    "amendment_reason" TEXT,
    "amended_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultation_versions_clinic_id_idx" ON "consultation_versions"("clinic_id");

-- CreateIndex
CREATE INDEX "consultation_versions_patient_id_idx" ON "consultation_versions"("patient_id");

-- CreateIndex
CREATE INDEX "consultation_versions_consultation_id_idx" ON "consultation_versions"("consultation_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_versions_consultation_id_version_number_key" ON "consultation_versions"("consultation_id", "version_number");

-- CreateIndex
CREATE INDEX "diagnoses_consultation_id_is_current_idx" ON "diagnoses"("consultation_id", "is_current");

-- CreateIndex
CREATE INDEX "observations_consultation_id_is_current_idx" ON "observations"("consultation_id", "is_current");

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_amended_by_id_fkey" FOREIGN KEY ("amended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
