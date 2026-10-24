// FILE: tests/server/emulator/firestore-counter.ts
//
// Counts Firestore document reads and writes the way billing does, for the
// per-session budget in docs/PLATFORM.md (section 16, "Firestore per
// session"). It wraps the Admin SDK's own RPC funnel, so every path counts:
// a document get or a transactional get is one read per document asked for
// (found or not), a query is one read per document returned and at least
// one, and a commit is one write per document written.
import { Firestore, Query } from "firebase-admin/firestore";

export interface FirestoreCount {
  reads: number;
  writes: number;
  /** "read users/u1", "query attempts (0 docs)", "write users/u1/progress/summary". */
  log: string[];
}

type Internal = {
  requestStream: (method: string, bidirectional: boolean, request: { documents?: string[] }, tag: string) => Promise<unknown>;
  request: (method: string, request: { writes?: { update?: { name: string }; delete?: string }[] }, tag: string, codes?: unknown) => Promise<unknown>;
};

const short = (name: string) => name.replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\//, "");

let current: FirestoreCount | null = null;
let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  const proto = Firestore.prototype as unknown as Internal;
  const requestStream = proto.requestStream;
  proto.requestStream = function (this: unknown, method, bidirectional, request, tag) {
    if (current && method === "batchGetDocuments") {
      for (const name of request.documents ?? []) {
        current.reads += 1;
        current.log.push(`read ${short(name)}`);
      }
    }
    return requestStream.call(this, method, bidirectional, request, tag);
  };
  const request = proto.request;
  proto.request = function (this: unknown, method, body, tag, codes) {
    if (current && method === "commit") {
      for (const write of body.writes ?? []) {
        current.writes += 1;
        current.log.push(`write ${short(write.update?.name ?? write.delete ?? "?")}`);
      }
    }
    return request.call(this, method, body, tag, codes);
  };
  const queryProto = Query.prototype as unknown as { _get: (...args: unknown[]) => Promise<{ result: { size: number; query?: { _queryOptions?: { collectionId?: string } } } }> };
  const get = queryProto._get;
  queryProto._get = async function (this: unknown, ...args: unknown[]) {
    const response = await get.apply(this, args);
    if (current) {
      const size = response.result.size;
      current.reads += Math.max(1, size);
      current.log.push(`query ${response.result.query?._queryOptions?.collectionId ?? "?"} (${size} docs)`);
    }
    return response;
  };
}

/** Runs `work` and returns what it cost in Firestore reads and writes. */
export async function countFirestore<T>(work: () => Promise<T>): Promise<{ value: T; count: FirestoreCount }> {
  install();
  const count: FirestoreCount = { reads: 0, writes: 0, log: [] };
  current = count;
  try {
    const value = await work();
    return { value, count };
  } finally {
    current = null;
  }
}
