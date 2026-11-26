import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";

test("UT-BASELINE: key tidak valid ditolak tanpa memanggil port", async () => {
  const calls = {
    find: 0,
    reserve: 0,
    complete: 0,
    abort: 0,
    tryReserve: 0,
    save: 0,
    release: 0,
  };

  const ports = {
    idempotency: {
      find: async () => {
        calls.find++;
        return null;
      },
      reserve: async () => {
        calls.reserve++;
        return null;
      },
      complete: async () => {
        calls.complete++;
      },
      abort: async () => {
        calls.abort++;
      },
    },
    seat: {
      tryReserve: async () => {
        calls.tryReserve++;
        return null;
      },
      release: async () => {
        calls.release++;
      },
    },
    enrollment: {
      save: async () => {
        calls.save++;
        return null;
      },
    },
  };

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
