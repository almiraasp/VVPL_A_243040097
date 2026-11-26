import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";
import { createFixture } from "./fixtures/fixtures.js";

// ==========================================
// TEST BASELINE
// ==========================================

test("UT-BASELINE: key tidak valid ditolak tanpa memanggil port", async () => {
  const { ports, state, calls } = createFixture();

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "123456789012345",
    },
    ports,
  );

  assert.deepEqual(result, { code: "INVALID_KEY" });

  assert.equal(state.seats.get("KLS001"), 1);
  assert.equal(state.enrollments.length, 0);
  assert.equal(state.claims.size, 0);
  assert.equal(state.completedKeys.size, 0);

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
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const result = await submitEnrollment(request, ports);

  assert.deepEqual(result, {
    code: "OK",
    enrollmentId: "ENR-1",
  });

  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 1);
  assert.equal(state.completedKeys.size, 1);
  assert.equal(state.claims.size, 0);

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
  const { ports, state, calls } = createFixture({
    initialSeats: 2,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(request, ports);

  const seatsAfterFirst = state.seats.get("KLS001");
  const enrollmentsAfterFirst = state.enrollments.length;
  const completedKeysAfterFirst = state.completedKeys.size;

  const replayResult = await submitEnrollment(request, ports);

  assert.deepEqual(replayResult, firstResult);

  assert.equal(state.seats.get("KLS001"), seatsAfterFirst);
  assert.equal(state.enrollments.length, enrollmentsAfterFirst);
  assert.equal(state.completedKeys.size, completedKeysAfterFirst);
  assert.equal(state.claims.size, 0);

  assert.equal(calls.tryReserve, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.complete, 1);
});

// ==========================================
// UT03: KONFLIK PAYLOAD
// ==========================================

test("UT03: key sama dengan classId berbeda menghasilkan conflict tanpa mengubah data pertama", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 2,
  });

  state.seats.set("KLS002", 3);

  const firstRequest = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const conflictingRequest = {
    studentId: "MHS001",
    classId: "KLS002",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(firstRequest, ports);

  const firstClassSeats = state.seats.get("KLS001");
  const secondClassSeats = state.seats.get("KLS002");
  const enrollmentCount = state.enrollments.length;
  const completedKeyCount = state.completedKeys.size;

  const conflictResult = await submitEnrollment(conflictingRequest, ports);

  assert.deepEqual(conflictResult, {
    code: "IDEMPOTENCY_CONFLICT",
  });

  assert.equal(state.enrollments[0].enrollmentId, firstResult.enrollmentId);

  assert.equal(state.seats.get("KLS001"), firstClassSeats);
  assert.equal(state.seats.get("KLS002"), secondClassSeats);
  assert.equal(state.enrollments.length, enrollmentCount);
  assert.equal(state.completedKeys.size, completedKeyCount);
  assert.equal(state.claims.size, 0);

  assert.equal(calls.tryReserve, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.complete, 1);
  assert.equal(calls.release, 0);
});

// ==========================================
// UT04: KELAS PENUH
// ==========================================

test("UT04: kelas penuh tidak membuat enrollment dan tidak mengurangi kursi", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 0,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const result = await submitEnrollment(request, ports);

  assert.deepEqual(result, {
    code: "CLASS_FULL",
  });

  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 0);
  assert.equal(state.completedKeys.size, 0);
  assert.equal(state.claims.size, 0);

  assert.deepEqual(calls, {
    find: 1,
    reserve: 1,
    complete: 0,
    abort: 1,
    tryReserve: 1,
    save: 0,
    release: 0,
  });
});

// ==========================================
// UT05: SAVE GAGAL
// ==========================================

test("UT05: save gagal melepaskan kursi dan membersihkan klaim key", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
    saveShouldFail: true,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const result = await submitEnrollment(request, ports);

  assert.deepEqual(result, {
    code: "SAVE_FAILED",
  });

  assert.equal(state.seats.get("KLS001"), 1);
  assert.equal(state.enrollments.length, 0);
  assert.equal(state.claims.size, 0);
  assert.equal(state.completedKeys.size, 0);

  assert.deepEqual(calls, {
    find: 1,
    reserve: 1,
    complete: 0,
    abort: 1,
    tryReserve: 1,
    save: 1,
    release: 1,
  });
});
