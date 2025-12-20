/**
 * Restore Backup Script
 * 
 * This script restores exhibition data from backup files.
 * Use this if the sync-all script produced bad data.
 * 
 * Usage: npm run restore-backup
 */

import fs from 'fs';
import path from 'path';
import { enabledMuseums } from './museum-config';

function main() {
    console.log('='.repeat(60));
    console.log('  RESTORE BACKUP - Reverting to Previous Data');
    console.log('='.repeat(60));
    console.log('');

    let restored = 0;
    let notFound = 0;

    for (const config of enabledMuseums) {
        const outputPath = path.join(process.cwd(), config.outputFile);
        const backupPath = outputPath.replace('.json', '.backup.json');

        if (fs.existsSync(backupPath)) {
            // Restore from backup
            fs.copyFileSync(backupPath, outputPath);
            console.log(`  ✓ Restored: ${config.outputFile}`);
            restored++;
        } else {
            console.log(`  ⚠ No backup found: ${config.outputFile}`);
            notFound++;
        }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  RESTORE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n  ✓ Restored: ${restored} files`);
    if (notFound > 0) {
        console.log(`  ⚠ No backup: ${notFound} files`);
    }
    console.log('');
}

main();
