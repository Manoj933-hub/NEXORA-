-- DropForeignKey
ALTER TABLE "clinical_audit_logs" DROP CONSTRAINT "clinical_audit_logs_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "clinical_audit_logs" DROP CONSTRAINT "clinical_audit_logs_patient_id_fkey";

-- DropForeignKey
ALTER TABLE "consultation_versions" DROP CONSTRAINT "consultation_versions_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "consultation_versions" DROP CONSTRAINT "consultation_versions_consultation_id_fkey";

-- DropForeignKey
ALTER TABLE "consultation_versions" DROP CONSTRAINT "consultation_versions_patient_id_fkey";

-- AddForeignKey
ALTER TABLE "clinical_audit_logs" ADD CONSTRAINT "clinical_audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_audit_logs" ADD CONSTRAINT "clinical_audit_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_versions" ADD CONSTRAINT "consultation_versions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
