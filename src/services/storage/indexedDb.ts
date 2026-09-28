/**
 * WonBee IndexedDB Storage Engine (Powered by Dexie.js)
 * Ultra-fast indexed browser database with Stale-While-Revalidate support for 1000MB+ datasets.
 */
import { WorkspaceData, TableDocument, TreeItem } from '../../types';
import { wonbeeDexieDB } from './dexieDb';

export class WonBeeIndexedDB {
  public async loadWorkspace(): Promise<WorkspaceData> {
    return wonbeeDexieDB.loadWorkspace();
  }

  public async saveFullWorkspace(workspace: WorkspaceData): Promise<void> {
    return wonbeeDexieDB.saveFullWorkspace(workspace);
  }

  public async saveTable(table: TableDocument): Promise<void> {
    return wonbeeDexieDB.saveTable(table);
  }

  public async deleteTable(tableId: string): Promise<void> {
    return wonbeeDexieDB.deleteTable(tableId);
  }

  public async saveTree(tree: TreeItem[]): Promise<void> {
    return wonbeeDexieDB.saveTree(tree);
  }

  public async applyDeltaNotes(notes: any[]): Promise<void> {
    return wonbeeDexieDB.applyDeltaNotes(notes);
  }

  public async getStorageStats(): Promise<{ totalItems: number; sizeEstimatedBytes: number }> {
    return wonbeeDexieDB.getStorageStats();
  }
}

export const wonbeeDB = new WonBeeIndexedDB();
