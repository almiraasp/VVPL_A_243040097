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
