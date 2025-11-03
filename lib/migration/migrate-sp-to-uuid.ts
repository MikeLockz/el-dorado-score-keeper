/**
 * Migration Script: sp-### to UUID Conversion
 *
 * This script converts existing single-player games with sp-### format IDs
 * to UUID format as part of the UUID migration process.
 */

import { openDB } from '@/lib/state/db';
import { generateUUID } from '@/lib/state/utils';

type GameIndexEntry = {
  height: number;
  savedAt: number;
};

type GameIndex = {
  games: Record<string, GameIndexEntry>;
};

export async function migrateSpGamesToUUID(): Promise<void> {
  console.log('🔄 Starting migration from sp-### to UUID format...');

  const db = await openDB('app-db');

  try {
    // Get existing sp-game-index
    const transaction = db.transaction(['state'], 'readwrite');
    const store = transaction.objectStore('state');

    const indexRequest = store.get('sp/game-index');
    const gameIndex = await new Promise<GameIndex>((resolve, reject) => {
      indexRequest.onsuccess = () => resolve(indexRequest.result || { games: {} });
      indexRequest.onerror = () => reject(indexRequest.error);
    });

    // Get existing sp/snapshot to potentially update snapshot gameId
    const snapshotRequest = store.get('sp/snapshot');
    const snapshot = await new Promise<any>((resolve, reject) => {
      snapshotRequest.onsuccess = () => resolve(snapshotRequest.result || null);
      snapshotRequest.onerror = () => reject(snapshotRequest.error);
    });

    const migrations: Array<{ oldId: string; newId: string }> = [];
    let snapshotMigrated = false;

    // Migrate each sp-### game to UUID
    for (const [spId, data] of Object.entries(gameIndex.games || {})) {
      if (spId.startsWith('sp-')) {
        const newId = generateUUID();
        migrations.push({ oldId: spId, newId });

        // Update index entry
        gameIndex.games[newId] = { ...data };
        delete gameIndex.games[spId];

        // Update snapshot if it references this game
        if (snapshot && snapshot.snapshot && snapshot.snapshot.gameId === spId) {
          snapshot.snapshot.gameId = newId;
          snapshotMigrated = true;
        }
      }
    }

    if (migrations.length === 0) {
      console.log('✅ No sp-### games found to migrate.');
      return;
    }

    // Save updated index
    const putIndexRequest = store.put(gameIndex);
    await new Promise<void>((resolve, reject) => {
      putIndexRequest.onsuccess = () => resolve();
      putIndexRequest.onerror = () => reject(putIndexRequest.error);
    });

    // Save updated snapshot if migrated
    if (snapshotMigrated) {
      const putSnapshotRequest = store.put(snapshot);
      await new Promise<void>((resolve, reject) => {
        putSnapshotRequest.onsuccess = () => resolve();
        putSnapshotRequest.onerror = () => reject(putSnapshotRequest.error);
      });
    }

    console.log(`✅ Successfully migrated ${migrations.length} games from sp-### to UUID format:`);
    migrations.forEach(({ oldId, newId }) => {
      console.log(`   ${oldId} → ${newId}`);
    });

    // Clear current application state to force refresh with new UUIDs
    try {
      localStorage.removeItem('app-events:signal:app-db');
      localStorage.removeItem('app-events:lastSeq:app-db');
      console.log('🧹 Cleared localStorage to force state refresh');
    } catch (error) {
      console.warn('⚠️  Failed to clear localStorage:', error);
    }
  } finally {
    db.close();
  }
}

/**
 * Check if migration is needed
 */
export async function checkMigrationNeeded(): Promise<boolean> {
  const db = await openDB('app-db');

  try {
    const transaction = db.transaction(['state'], 'readonly');
    const store = transaction.objectStore('state');

    const indexRequest = store.get('sp/game-index');
    const gameIndex = await new Promise<GameIndex>((resolve, reject) => {
      indexRequest.onsuccess = () => resolve(indexRequest.result || { games: {} });
      indexRequest.onerror = () => reject(indexRequest.error);
    });

    const spGameIds = Object.keys(gameIndex.games || {}).filter((id) => id.startsWith('sp-'));
    return spGameIds.length > 0;
  } finally {
    db.close();
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  totalGames: number;
  spFormatGames: number;
  uuidFormatGames: number;
  needsMigration: boolean;
}> {
  const db = await openDB('app-db');

  try {
    const transaction = db.transaction(['state'], 'readonly');
    const store = transaction.objectStore('state');

    const indexRequest = store.get('sp/game-index');
    const gameIndex = await new Promise<GameIndex>((resolve, reject) => {
      indexRequest.onsuccess = () => resolve(indexRequest.result || { games: {} });
      indexRequest.onerror = () => reject(indexRequest.error);
    });

    const allGameIds = Object.keys(gameIndex.games || {});
    const spGameIds = allGameIds.filter((id) => id.startsWith('sp-'));
    const uuidGameIds = allGameIds.filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    );

    return {
      totalGames: allGameIds.length,
      spFormatGames: spGameIds.length,
      uuidFormatGames: uuidGameIds.length,
      needsMigration: spGameIds.length > 0,
    };
  } finally {
    db.close();
  }
}

/**
 * Run migration safely with error handling
 */
export async function runMigrationSafely(): Promise<{
  success: boolean;
  migrated: number;
  error?: string;
}> {
  try {
    const status = await getMigrationStatus();

    if (!status.needsMigration) {
      console.log('✅ No migration needed - all games already use UUID format');
      return { success: true, migrated: 0 };
    }

    console.log(
      `📊 Migration Status: ${status.spFormatGames} sp-### games, ${status.uuidFormatGames} UUID games`,
    );

    await migrateSpGamesToUUID();

    const finalStatus = await getMigrationStatus();

    return {
      success: finalStatus.spFormatGames === 0,
      migrated: status.spFormatGames,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Migration failed:', errorMessage);

    return {
      success: false,
      migrated: 0,
      error: errorMessage,
    };
  }
}
