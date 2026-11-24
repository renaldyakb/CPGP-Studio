import { syncDatabaseWithDisk } from './storage.ts';
import {
  getActiveWorkspace,
  getWorkspacePaths,
} from './workspaces/registry.ts';

function runCliScan() {
  const activeWorkspace = getActiveWorkspace();
  const workspacePaths = getWorkspacePaths(activeWorkspace.id);

  console.log('================================================================');
  console.log(' CPGP: Multi-Workspace Content Auto-Scanner');
  console.log(
    ` Workspace : ${activeWorkspace.name} (${activeWorkspace.id})`
  );
  console.log(` Source    : ${activeWorkspace.contentRootPath}`);
  console.log(` Output    : ${workspacePaths.plannerFile}`);
  console.log('================================================================\n');

  const db = syncDatabaseWithDisk(
    activeWorkspace.contentRootPath,
    activeWorkspace.defaultYear,
    workspacePaths.plannerFile,
    activeWorkspace
  );
  const items = Object.values(db.items);

  const summaryRows = items.map((item) => ({
    ID: item.id,
    Tanggal: item.schedule.displayDate,
    Slot: `${item.schedule.slotCode} (${item.schedule.slotLabel} ${item.schedule.recommendedTimeWib})`,
    WM_Final: item.autoMetadata.readiness.hasWmFinal
      ? item.autoMetadata.assets.wmVideo.fileName ?? 'Ada'
      : 'BELUM',
    Raw_MP4: item.autoMetadata.readiness.hasRawVideo ? 'OK' : 'BELUM',
    Cover: item.autoMetadata.readiness.hasCover ? 'OK' : 'BELUM',
    Caption: item.autoMetadata.readiness.hasCaption ? 'OK' : 'BELUM',
    Status: item.userProperties.workflowStatus,
    Hook:
      item.autoMetadata.captionParsed.hookTitle.length > 42
        ? `${item.autoMetadata.captionParsed.hookTitle.slice(0, 42)}...`
        : item.autoMetadata.captionParsed.hookTitle,
  }));

  console.table(summaryRows);

  console.log('\nRingkasan Statistik Workspace:');
  console.log(`  - Workspace                : ${activeWorkspace.name} (${activeWorkspace.id})`);
  console.log(`  - Total Konten             : ${db.stats.totalItems}`);
  console.log(`  - Siap Upload (Ready)      : ${db.stats.uploadReadyCount}`);
  console.log(`  - Menunggu Watermark       : ${db.stats.needsWatermarkCount}`);
  console.log(`  - Aset Belum Lengkap       : ${db.stats.incompleteAssetsCount}`);
  console.log(`  - Slot 01 (Siang 11.30)    : ${db.stats.slot01Count}`);
  console.log(`  - Slot 02 (Malam 19.30)    : ${db.stats.slot02Count}`);
  console.log(
    `\nDatabase JSON berhasil disimpan ke: ${workspacePaths.plannerFile}`
  );
}

runCliScan();
