export function createFixture({ initialSeats = 1, saveShouldFail = false } = {}) {
  const state = {
    seats: new Map([["KLS001", initialSeats]]),
    enrollments: [],
    completedKeys: new Map(),
    claims: new Map(),
    saveShouldFail,
  };

  const calls = {
    find: 0,
    reserve: 0,
    complete: 0,
    abort: 0,
    tryReserve: 0,
    save: 0,
    release: 0,
  };

  let nextToken = 1;
  let nextEnrollmentId = 1;

  const ports = {
    idempotency: {
      find: async (scope, key) => {
        calls.find++;
        const storageKey = JSON.stringify([scope, key]);
        return state.completedKeys.get(storageKey) ?? null;
      },

      reserve: async (scope, key, fingerprint) => {
        calls.reserve++;
        const storageKey = JSON.stringify([scope, key]);

        if (state.claims.has(storageKey) || state.completedKeys.has(storageKey)) {
          return null;
        }

        const token = `TOKEN-${nextToken++}`;

        state.claims.set(storageKey, {
          token,
          fingerprint,
        });

        return token;
      },

      complete: async (token, result) => {
        calls.complete++;

        for (const [storageKey, claim] of state.claims) {
          if (claim.token === token) {
            state.completedKeys.set(storageKey, {
              fingerprint: claim.fingerprint,
              result,
            });

            state.claims.delete(storageKey);
            return;
          }
        }
      },

      abort: async (token) => {
        calls.abort++;

        for (const [storageKey, claim] of state.claims) {
          if (claim.token === token) {
            state.claims.delete(storageKey);
            return;
          }
        }
      },
    },

    seat: {
      tryReserve: async (classId) => {
        calls.tryReserve++;

        const available = state.seats.get(classId) ?? 0;

        if (available <= 0) {
          return null;
        }

        state.seats.set(classId, available - 1);

        return {
          classId,
          reservationId: `RES-${calls.tryReserve}`,
        };
      },

      release: async (reservation) => {
        calls.release++;

        const available = state.seats.get(reservation.classId) ?? 0;

        state.seats.set(reservation.classId, available + 1);
      },
    },

    enrollment: {
      save: async (record) => {
        calls.save++;

        if (state.saveShouldFail) {
          throw new Error("Simulasi kegagalan penyimpanan");
        }

        const enrollment = {
          ...record,
          enrollmentId: `ENR-${nextEnrollmentId++}`,
        };

        state.enrollments.push(enrollment);

        return enrollment;
      },
    },
  };

  return {
    ports,
    state,
    calls,
  };
}
