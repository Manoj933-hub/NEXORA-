import { PrismaClient } from '@prisma/client';

type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Generates a clinic-scoped unique Medical Record Number (MRN).
 * Format: NX-XXXX (e.g. NX-0001, NX-0002)
 */
export async function generateClinicMRN(
  tx: PrismaTransactionClient,
  clinicId: string
): Promise<string> {
  const patientCount = await tx.patient.count({
    where: { clinicId },
  });

  let counter = patientCount + 1;
  let candidate = `NX-${counter.toString().padStart(4, '0')}`;

  // Defensively ensure no collision in case of past deletes or manual IDs
  while (true) {
    const existing = await tx.patient.findUnique({
      where: {
        clinicId_mrn: {
          clinicId,
          mrn: candidate,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    counter++;
    candidate = `NX-${counter.toString().padStart(4, '0')}`;
  }
}
