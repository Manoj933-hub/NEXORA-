import { PrismaClient, ClinicRole } from '@prisma/client';

export interface AuditLogParams {
  clinicId: string;
  patientId: string;
  consultationId?: string | null;
  actorId: string;
  actorName: string;
  actorRole: ClinicRole;
  recordType: 'CONSULTATION' | 'PRESCRIPTION' | 'OBSERVATION' | 'DIAGNOSIS';
  recordId: string;
  action: 'CREATE' | 'UPDATE' | 'FINALIZE' | 'AMEND' | 'CANCEL' | 'DISCONTINUE';
  details?: string | null;
}

/**
 * Creates an append-only clinical audit log entry.
 * Designed to execute inside transactions or on the main Prisma client.
 */
export async function recordClinicalAudit(
  prismaClient: {
    clinicalAuditLog: {
      create: PrismaClient['clinicalAuditLog']['create'];
    };
  },
  params: AuditLogParams
) {
  try {
    return await prismaClient.clinicalAuditLog.create({
      data: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        consultationId: params.consultationId || null,
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        recordType: params.recordType,
        recordId: params.recordId,
        action: params.action,
        details: params.details || null,
      },
    });
  } catch (error) {
    // Audit failure should be logged safely to server stderr without exposing PHI
    console.error('Failed to create clinical audit log record:', error);
    throw error;
  }
}
