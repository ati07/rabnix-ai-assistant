import { BufferJSON, initAuthCreds, proto } from "baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "baileys";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections } from "@/lib/db/schema";

/**
 * Baileys auth state backed by Postgres (`whatsapp_connections.session_data`),
 * so a tenant's WhatsApp link survives worker restarts and stays multi-tenant.
 *
 * Baileys' own `useMultiFileAuthState` writes to the local disk and is not
 * suitable here (its docs recommend a real DB store for anything beyond a toy
 * bot). We serialize the whole `{ creds, keys }` blob with `BufferJSON` (which
 * safely round-trips the Buffers/Uint8Arrays in the key material) into a single
 * JSON string stored inside the `session_data` jsonb column.
 */

interface StoredSession {
  blob: string;
}

type KeyMap = {
  [category: string]: { [id: string]: unknown };
};

export interface DbAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  /** Wipe stored credentials (call on logout). */
  clear: () => Promise<void>;
}

export async function createDbAuthState(
  connectionId: string,
): Promise<DbAuthState> {
  const { creds, keys } = await load(connectionId);

  const persist = async () => {
    const blob = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    await db
      .update(whatsappConnections)
      .set({ sessionData: { blob } satisfies StoredSession })
      .where(eq(whatsappConnections.id, connectionId));
  };

  const state: AuthenticationState = {
    creds,
    keys: {
      get: (type, ids) => {
        const category = (keys[type] ?? {}) as Record<string, unknown>;
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        for (const id of ids) {
          let value = category[id];
          if (value && type === "app-state-sync-key") {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as Record<string, unknown>,
            );
          }
          if (value !== undefined) {
            result[id] = value as SignalDataTypeMap[typeof type];
          }
        }
        return result;
      },
      set: async (data) => {
        for (const category in data) {
          const entry = data[category as keyof typeof data];
          keys[category] = keys[category] ?? {};
          for (const id in entry) {
            const value = entry[id];
            if (value === null || value === undefined) {
              delete keys[category][id];
            } else {
              keys[category][id] = value;
            }
          }
        }
        await persist();
      },
    },
  };

  return {
    state,
    saveCreds: persist,
    clear: async () => {
      await db
        .update(whatsappConnections)
        .set({ sessionData: null })
        .where(eq(whatsappConnections.id, connectionId));
    },
  };
}

async function load(
  connectionId: string,
): Promise<{ creds: AuthenticationCreds; keys: KeyMap }> {
  const row = await db.query.whatsappConnections.findFirst({
    where: eq(whatsappConnections.id, connectionId),
  });

  const stored = row?.sessionData as StoredSession | null | undefined;
  if (stored?.blob) {
    const parsed = JSON.parse(stored.blob, BufferJSON.reviver) as {
      creds: AuthenticationCreds;
      keys: KeyMap;
    };
    return { creds: parsed.creds, keys: parsed.keys ?? {} };
  }

  return { creds: initAuthCreds(), keys: {} };
}
