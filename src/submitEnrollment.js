/**
 * Memproses pendaftaran mahasiswa.
 *
 * U8-R01:
 * Key harus berupa string dengan panjang 16–64 karakter.
 *
 * U8-R02:
 * Scope key menggunakan studentId dan term.
 * Fingerprint membandingkan studentId, classId, dan term.
 */
export async function submitEnrollment({ studentId, classId, term, idempotencyKey }, ports) {
  // Validasi panjang key
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 64) {
    return { code: "INVALID_KEY" };
  }

  // Membuat scope dan fingerprint
  const scope = JSON.stringify([studentId, term]);

  const fingerprint = JSON.stringify([studentId, classId, term]);

  // Memeriksa key yang sudah tersimpan
  const existing = await ports.idempotency.find(scope, idempotencyKey);

  // Penanganan sementara untuk key yang sudah digunakan.
  // Perilaku replay akan dikembangkan melalui test berikutnya.
  if (existing) {
    return { code: "IDEMPOTENCY_CONFLICT" };
  }

  // Membuat klaim key sementara
  const token = await ports.idempotency.reserve(scope, idempotencyKey, fingerprint);

  if (!token) {
    return { code: "IDEMPOTENCY_CONFLICT" };
  }

  // Memesan satu kursi
  const reservation = await ports.seat.tryReserve(classId);

  if (!reservation) {
    await ports.idempotency.abort(token);
    return { code: "CLASS_FULL" };
  }

  // Menyimpan enrollment
  const enrollment = await ports.enrollment.save({
    studentId,
    classId,
    term,
  });

  // Menyimpan hasil akhir untuk kebutuhan replay
  const result = {
    code: "OK",
    enrollmentId: enrollment.enrollmentId,
  };

  await ports.idempotency.complete(token, result);

  return result;
}
