import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";
import { createFixture } from "./fixtures/fixtures.js";

// ==========================================
// TEST BASELINE
// ==========================================

test("UT-BASELINE: key tidak valid ditolak tanpa memanggil port", async () => {
  // Arrange
  const { ports, state, calls } = createFixture();

  // Act
  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "123456789012345",
    },
    ports,
  );

  // Assert: hasil
  assert.deepEqual(result, { code: "INVALID_KEY" });

  // Assert: tidak ada perubahan data
  assert.equal(state.seats.get("KLS001"), 1);
  assert.equal(state.enrollments.length, 0);
  assert.equal(state.claims.size, 0);
  assert.equal(state.completedKeys.size, 0);

  // Assert: tidak ada port yang dipanggil
  assert.deepEqual(calls, {
    find: 0,
    reserve: 0,
    complete: 0,
    abort: 0,
    tryReserve: 0,
    save: 0,
    release: 0,
  });
});

// ==========================================
// UT01: KEY BARU DAN KURSI TERSEDIA
// ==========================================

test("UT01: key baru dan kursi tersedia menghasilkan satu enrollment", async () => {
  // Arrange
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  // Act
  const result = await submitEnrollment(request, ports);

  // Assert: hasil pendaftaran
  assert.deepEqual(result, {
    code: "OK",
    enrollmentId: "ENR-1",
  });

  // Assert: perubahan data
  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 1);
  assert.equal(state.completedKeys.size, 1);
  assert.equal(state.claims.size, 0);

  // Assert: jumlah pemanggilan port
  assert.deepEqual(calls, {
    find: 1,
    reserve: 1,
    complete: 1,
    abort: 0,
    tryReserve: 1,
    save: 1,
    release: 0,
  });
});

// ==========================================
// UT02: REPLAY KEY DAN PAYLOAD SAMA
// ==========================================

test("UT02: replay key dan payload sama mengembalikan hasil pertama tanpa efek tambahan", async () => {
  // Arrange
  const { ports, state, calls } = createFixture({
    initialSeats: 2,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  // Act: pendaftaran pertama
  const firstResult = await submitEnrollment(request, ports);

  // Simpan kondisi setelah pendaftaran pertama
  const seatsAfterFirst = state.seats.get("KLS001");
  const enrollmentsAfterFirst = state.enrollments.length;
  const completedKeysAfterFirst = state.completedKeys.size;

  // Act: permintaan yang sama dikirim kembali
  const replayResult = await submitEnrollment(request, ports);

  // Assert: hasil replay harus sama dengan hasil pertama
  assert.deepEqual(replayResult, firstResult);

  // Assert: tidak ada perubahan data tambahan
  assert.equal(state.seats.get("KLS001"), seatsAfterFirst);
  assert.equal(state.enrollments.length, enrollmentsAfterFirst);
  assert.equal(state.completedKeys.size, completedKeysAfterFirst);
  assert.equal(state.claims.size, 0);

  // Assert: hanya satu reservasi dan satu penyimpanan enrollment
  assert.equal(calls.tryReserve, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.complete, 1);
});
