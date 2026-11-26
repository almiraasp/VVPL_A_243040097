/**
 * Fungsi untuk memproses pendaftaran mahasiswa.
 *
 * Kontrak:
 * submitEnrollment(
 *   { studentId, classId, term, idempotencyKey },
 *   ports
 * )
 *
 * U8-R01:
 * Key harus berupa string dengan panjang
 * minimal 16 dan maksimal 64 karakter.
 */
export async function submitEnrollment({ studentId, classId, term, idempotencyKey }, ports) {
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 64) {
    return { code: "INVALID_KEY" };
  }

  return { code: "NOT_IMPLEMENTED" };
}
