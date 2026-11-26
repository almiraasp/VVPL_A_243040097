import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";
import { createFixture } from "./fixtures/fixtures.js";

const request = (idempotencyKey) => ({
  studentId: "MHS001",
  classId: "KLS001",
  term: "2026-GANJIL",
  idempotencyKey,
});

// TEST BASELINE
test("UT-BASELINE: key tidak valid ditolak tanpa memanggil port", async () => {
  const { ports, state, calls } = createFixture();

  const result = await submitEnrollment(request("123456789012345"), ports);

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

// UT01: New enrollment
test("UT01: key baru dan kursi tersedia menghasilkan satu enrollment", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
  });

  const result = await submitEnrollment(request("abcdefghijklmnop"), ports);

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

// UT02: Replay
test("UT02: replay key dan payload sama mengembalikan hasil pertama tanpa efek tambahan", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 2,
  });

  const data = request("abcdefghijklmnop");

  const firstResult = await submitEnrollment(data, ports);
  const seatsAfterFirst = state.seats.get("KLS001");
  const enrollmentsAfterFirst = state.enrollments.length;
  const completedKeysAfterFirst = state.completedKeys.size;

  const replayResult = await submitEnrollment(data, ports);

  assert.deepEqual(replayResult, firstResult);
  assert.equal(state.seats.get("KLS001"), seatsAfterFirst);
  assert.equal(state.enrollments.length, enrollmentsAfterFirst);
  assert.equal(state.completedKeys.size, completedKeysAfterFirst);
  assert.equal(state.claims.size, 0);
  assert.equal(calls.tryReserve, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.complete, 1);
});

// UT03: Payload conflict
test("UT03: key sama dengan classId berbeda menghasilkan conflict tanpa mengubah data pertama", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 2,
  });

  state.seats.set("KLS002", 3);

  const firstResult = await submitEnrollment(request("abcdefghijklmnop"), ports);

  const firstClassSeats = state.seats.get("KLS001");
  const secondClassSeats = state.seats.get("KLS002");
  const enrollmentCount = state.enrollments.length;
  const completedKeyCount = state.completedKeys.size;

  const conflictResult = await submitEnrollment(
    {
      ...request("abcdefghijklmnop"),
      classId: "KLS002",
    },
    ports,
  );

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

// UT04: Full class
test("UT04: kelas penuh tidak membuat enrollment dan tidak mengurangi kursi", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 0,
  });

  const result = await submitEnrollment(request("abcdefghijklmnop"), ports);

  assert.deepEqual(result, { code: "CLASS_FULL" });
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

// UT05: Save failure
test("UT05: save gagal melepaskan kursi dan membersihkan klaim key", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
    saveShouldFail: true,
  });

  const result = await submitEnrollment(request("abcdefghijklmnop"), ports);

  assert.deepEqual(result, { code: "SAVE_FAILED" });
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

// UT06: Retry after save failure
test("UT06: retry setelah save gagal berhasil tanpa kehilangan atau menggandakan kursi", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
    saveShouldFail: true,
  });

  const data = request("abcdefghijklmnop");

  const firstResult = await submitEnrollment(data, ports);

  assert.deepEqual(firstResult, { code: "SAVE_FAILED" });
  assert.equal(state.seats.get("KLS001"), 1);
  assert.equal(state.enrollments.length, 0);
  assert.equal(state.claims.size, 0);
  assert.equal(state.completedKeys.size, 0);

  state.saveShouldFail = false;

  const retryResult = await submitEnrollment(data, ports);

  assert.deepEqual(retryResult, {
    code: "OK",
    enrollmentId: "ENR-1",
  });
  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 1);
  assert.equal(state.completedKeys.size, 1);
  assert.equal(state.claims.size, 0);
  assert.deepEqual(calls, {
    find: 2,
    reserve: 2,
    complete: 1,
    abort: 1,
    tryReserve: 2,
    save: 2,
    release: 1,
  });
});

// UT07: Key terlalu pendek
test("UT07: key 15 karakter ditolak tanpa perubahan data", async () => {
  const { ports, state, calls } = createFixture();

  const result = await submitEnrollment(request("123456789012345"), ports);

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

// UT08: Key tepat 16 karakter
test("UT08: key 16 karakter diterima dan pendaftaran berhasil", async () => {
  const { ports, state } = createFixture({
    initialSeats: 1,
  });

  const key = "a".repeat(16);
  const result = await submitEnrollment(request(key), ports);

  assert.equal(key.length, 16);
  assert.deepEqual(result, {
    code: "OK",
    enrollmentId: "ENR-1",
  });
  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 1);
  assert.equal(state.completedKeys.size, 1);
});

// UT09: Key tepat 64 karakter
test("UT09: key 64 karakter diterima dan pendaftaran berhasil", async () => {
  const { ports, state } = createFixture({
    initialSeats: 1,
  });

  const key = "a".repeat(64);
  const result = await submitEnrollment(request(key), ports);

  assert.equal(key.length, 64);
  assert.deepEqual(result, {
    code: "OK",
    enrollmentId: "ENR-1",
  });
  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 1);
  assert.equal(state.completedKeys.size, 1);
});

// UT10: Key terlalu panjang
test("UT10: key 65 karakter ditolak tanpa perubahan data", async () => {
  const { ports, state, calls } = createFixture();

  const key = "a".repeat(65);
  const result = await submitEnrollment(request(key), ports);

  assert.equal(key.length, 65);
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

// UT11: Same key with different scopes
test("UT11: key sama pada mahasiswa atau semester berbeda diproses secara terpisah", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 3,
  });

  const firstRequest = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const secondRequest = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GENAP",
    idempotencyKey: "abcdefghijklmnop",
  };

  const thirdRequest = {
    studentId: "MHS002",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(firstRequest, ports);
  const secondResult = await submitEnrollment(secondRequest, ports);
  const thirdResult = await submitEnrollment(thirdRequest, ports);

  assert.deepEqual(firstResult, {
    code: "OK",
    enrollmentId: "ENR-1",
  });

  assert.deepEqual(secondResult, {
    code: "OK",
    enrollmentId: "ENR-2",
  });

  assert.deepEqual(thirdResult, {
    code: "OK",
    enrollmentId: "ENR-3",
  });

  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 3);
  assert.equal(state.completedKeys.size, 3);
  assert.equal(state.claims.size, 0);

  assert.deepEqual(calls, {
    find: 3,
    reserve: 3,
    complete: 3,
    abort: 0,
    tryReserve: 3,
    save: 3,
    release: 0,
  });
});

// UT12: Replay when class is already full
test("UT12: replay tetap mengembalikan hasil pertama meskipun kursi sudah penuh", async () => {
  const { ports, state, calls } = createFixture({
    initialSeats: 1,
  });

  const request = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  // Pendaftaran pertama berhasil dan menghabiskan kursi
  const firstResult = await submitEnrollment(request, ports);

  assert.deepEqual(firstResult, {
    code: "OK",
    enrollmentId: "ENR-1",
  });

  assert.equal(state.seats.get("KLS001"), 0);

  // Replay ketika kelas sudah penuh
  const replayResult = await submitEnrollment(request, ports);

  assert.deepEqual(replayResult, firstResult);

  // Memastikan tidak ada proses pendaftaran tambahan
  assert.equal(state.seats.get("KLS001"), 0);
  assert.equal(state.enrollments.length, 1);
  assert.equal(state.completedKeys.size, 1);
  assert.equal(state.claims.size, 0);

  assert.deepEqual(calls, {
    find: 2,
    reserve: 1,
    complete: 1,
    abort: 0,
    tryReserve: 1,
    save: 1,
    release: 0,
  });
});
