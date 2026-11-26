/**
 * Memproses pendaftaran mahasiswa.
 *
 * U8-R01:
 * Key harus berupa string dengan panjang 16–64 karakter.
 *
 * U8-R02:
 * Scope key menggunakan studentId dan term.
 * Fingerprint membandingkan studentId, classId, dan term.
 *
 * U8-R03:
 * Key baru dan kursi tersedia menghasilkan enrollment.
 *
 * U8-R04:
 * Replay dengan fingerprint sama mengembalikan hasil pertama.
 *
 * U8-R05:
 * Payload berbeda dengan scope dan key sama menghasilkan conflict.
 *
 * U8-R06:
 * Kelas penuh tidak membuat enrollment.
 *
 * U8-R07:
 * Save gagal menyebabkan kursi dilepas dan klaim key dibersihkan.
 */
export async function submitEnrollment({ studentId, classId, term, idempotencyKey }, ports) {
  // 1. Validasi panjang key
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 64) {
    return { code: "INVALID_KEY" };
  }

  // 2. Membuat scope dan fingerprint
  const scope = JSON.stringify([studentId, term]);

  const fingerprint = JSON.stringify([studentId, classId, term]);

  // 3. Memeriksa key yang sudah digunakan
  const existing = await ports.idempotency.find(scope, idempotencyKey);

  // 4. Menangani replay dan konflik payload
  if (existing) {
    if (existing.fingerprint === fingerprint) {
      return existing.result;
    }

    return { code: "IDEMPOTENCY_CONFLICT" };
  }

  // 5. Membuat klaim key sementara
  const token = await ports.idempotency.reserve(scope, idempotencyKey, fingerprint);

  if (!token) {
    return { code: "IDEMPOTENCY_CONFLICT" };
  }

  // 6. Memesan kursi
  const reservation = await ports.seat.tryReserve(classId);

  if (!reservation) {
    await ports.idempotency.abort(token);
    return { code: "CLASS_FULL" };
  }

  // 7. Menyimpan enrollment
  let enrollment;

  try {
    enrollment = await ports.enrollment.save({
      studentId,
      classId,
      term,
    });
  } catch (error) {
    // Jika save gagal, kembalikan kursi
    await ports.seat.release(reservation);

    // Hapus klaim key sementara
    await ports.idempotency.abort(token);

    return { code: "SAVE_FAILED" };
  }

  // 8. Menyiapkan hasil pendaftaran
  const result = {
    code: "OK",
    enrollmentId: enrollment.enrollmentId,
  };

  // 9. Menyimpan hasil akhir untuk kebutuhan replay
  await ports.idempotency.complete(token, result);

  // 10. Mengembalikan hasil
  return result;
}
