async function migrateChoreHistoryTitle(db) {
    try {
        const columns = db.prepare('PRAGMA table_info(chore_history)').all();
        const hasTitle = columns.some(col => col.name === 'title');

        if (!hasTitle) {
            db.exec('ALTER TABLE chore_history ADD COLUMN title TEXT DEFAULT NULL');
            console.log('Added title column to chore_history');
        }
    } catch (error) {
        console.error('Error migrating chore_history title:', error);
        throw error;
    }
}

module.exports = migrateChoreHistoryTitle;
