# Daily Chore Completion Bonus Tracking Enhancement

## Overview
This enhancement adds a "source" field to the chore_history table to track what caused an item to be added to the database. This provides better tracking and transparency for clam rewards.

## Changes Made

### 1. Database Schema Updates

#### Added Column
- **Column**: `source` (TEXT, nullable)
- **Values**:
  - `'Regular'` - Daily completion bonus awarded when all regular chores are completed
  - `'Adjustment'` - Manual clam adjustments made through the admin panel
  - `NULL` - Legacy records or standard chore completions

#### Added Indexes
- `idx_chore_history_source` - Index on the source column
- `idx_chore_history_user_date_source` - Composite index on user_id, date, and source
- `idx_chore_history_clam_value` - Index on clam_value for filtering by regular chores (clam_value = 0)

### 2. Migration Function
- Added `migrateChoreHistorySource()` function that:
  - Checks if the source column already exists
  - Adds the source column to existing databases
  - Runs automatically on server startup

### 3. API Endpoint Changes

#### `/api/chores/complete` Endpoint
**Enhancement**: Automatic daily bonus award when all regular chores are completed

- Now checks if the completed chore is a regular chore (clam_value === 0)
- If it is a regular chore:
  1. Gets all visible scheduled regular chores for that user
  2. Counts completed regular chores for today
  3. If all regular chores are now completed:
     - Retrieves the daily completion reward from settings
     - Checks if bonus already awarded (source = 'Regular')
     - Inserts bonus record with source = 'Regular' if not already awarded

**Key Changes**:
- Wrapped bonus logic in `if (schedule.clam_value === 0)` check
- Changed bonus detection from checking clam_value amount to checking source = 'Regular'
- Bonus INSERT now includes `source = 'Regular'`

#### `/api/chores/uncomplete` Endpoint
**Enhancement**: Automatic bonus removal when any regular chore is uncompleted

- After deleting the chore completion record:
- Checks if the uncompleted chore was a regular chore (history.clam_value === 0)
- If it was a regular chore:
  - Deletes any bonus entry with source = 'Regular' for that user and date

**Key Changes**:
- Simplified bonus deletion logic
- Now deletes based on source = 'Regular' instead of matching clam_value
- Deletes any bonus regardless of amount (as requested)

#### `/api/users/:id/clams/add` Endpoint
**Enhancement**: Track manual clam adjustments

- Now includes source = 'Adjustment' when inserting records
- This identifies manual admin panel adjustments

### 4. Behavior Details

#### Only Visible Chores Count
- Only chores with `visible = 1` are counted toward daily completion bonus
- Hidden chores do not affect bonus award or removal

#### Backward Compatibility
- Existing records without a source field will have NULL
- The system continues to work with legacy data
- No migration of existing data is needed (NULL is acceptable)

#### Bonus Award Logic
1. User completes a regular chore (clam_value = 0)
2. System checks all visible regular chores for that user
3. System counts completed regular chores for today
4. If counts match (all regular chores done), awards bonus
5. Bonus is only awarded once per day (checks for existing source = 'Regular')

#### Bonus Removal Logic
1. User uncompletes any regular chore (clam_value = 0)
2. System immediately removes the daily bonus (source = 'Regular')
3. Bonus is removed regardless of its clam_value amount

## Files Modified

1. **server/index.js**
   - Added source column to chore_history table schema (line 780)
   - Added new indexes for performance (lines 788-790)
   - Added `migrateChoreHistorySource()` function (lines 875-896)
   - Called migration in startup sequence (line 2487)
   - Updated `/api/chores/complete` endpoint (lines 1306-1341)
   - Updated `/api/chores/uncomplete` endpoint (lines 1366-1371)
   - Updated `/api/users/:id/clams/add` endpoint (line 1403)

## Testing

The implementation has been verified with:
- Syntax validation of server code
- Database schema validation (source column exists)
- Index validation (all 6 indexes on chore_history exist)
- Client build successful

## Benefits

1. **Better Tracking**: Clear distinction between regular bonuses and manual adjustments
2. **Improved Logic**: Simpler, more reliable bonus detection using source field
3. **Performance**: New indexes optimize queries filtering by source and clam_value
4. **Backward Compatible**: Existing data continues to work with NULL source values
5. **Audit Trail**: Source field provides transparency for where clams came from
