Current State Analysis
The existing system stores all chore information in a single chores table with fields: id, user_id, title, description, time_period, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date. Clam totals are maintained in users.clam_total, and there's a pruneAndResetChores() function that runs on server startup to manage chore lifecycle.

IMPORTANT: Retain as much of the current chore UI as possible, especially the global buttons for adding the chores, viewing prizes, and hiding/exposing the bonus chores. New UI/modal windows can be implements when those buttons are pressed to implement the new core functionality.

1. Database Schema Changes
Remove obsolete fields from chores table:
    • Remove user_id (moves to chore_schedules)
    • Remove time_period (not needed in new design)
    • Remove assigned_day_of_week (replaced by crontab in chore_schedules)
    • Remove repeat_type (replaced by crontab in chore_schedules)
    • Remove completed (moves to chore_history)
    • Remove expiration_date (not needed in new design)
    • Keep only: id, title, description, clam_value
Create chore_schedules table:
    • id INTEGER PRIMARY KEY AUTOINCREMENT
    • chore_id INTEGER NOT NULL (foreign key to chores.id)
    • user_id INTEGER NULL (nullable for unassigned bonus chores)
    • crontab TEXT NULL (cron expression for recurrence, null for one-time tasks)
    • visible BOOLEAN NOT NULL DEFAULT 1 (true = active, false = hidden/completed one-time tasks)
    • created_at TEXT DEFAULT CURRENT_TIMESTAMP
    • Add index on chore_id
    • Add index on user_id
    • Add index on visible
Create chore_history table:
    • id INTEGER PRIMARY KEY AUTOINCREMENT
    • user_id INTEGER NOT NULL (who earned the clams)
    • chore_schedule_id INTEGER NULL (nullable for manual clam adjustments)
    • date TEXT NOT NULL (date when chore was completed, format: YYYY-MM-DD)
    • clam_value INTEGER NOT NULL DEFAULT 0 (clams earned for this entry)
    • created_at TEXT DEFAULT CURRENT_TIMESTAMP
    • Add index on user_id
    • Add index on date
    • Add compound index on (user_id, date) for efficient queries

2. Backend Database Migrations
Create migration function in server/index.js:
    • Check if migration has already been run (use a migration_version in settings table)
    • Backup existing chores data to temporary table
    • Create new chore_schedules table
    • Create new chore_history table
    • Migrate existing chores data:
        ◦ Insert core chore info into new chores table (id, title, description, clam_value)
        ◦ Create corresponding chore_schedules entries with converted crontab expressions:
            ▪ "daily" → "0 0 * * *" (every day at midnight)
            ▪ "weekly" with assigned_day_of_week → "0 0 * * N" where N is day number (0=Sunday)
            ▪ "no-repeat" → crontab = NULL, visible = (completed ? false : true)
            ▪ "until-completed" → "0 0 * * *" with special handling in code
        ◦ Create chore_history entries for completed chores from today
    • Drop obsolete columns from chores table using CREATE TABLE / INSERT / DROP pattern
    • Update migration_version setting
    • Log migration status and any errors
Update pruneAndResetChores function:
    • Remove this function entirely as it's no longer needed
    • The new system calculates visible chores on-demand rather than pre-creating them

3. Backend API Endpoints - CRUD Operations
Chores endpoints (update existing):
    • GET /api/chores - Return all chores (just core data)
    • POST /api/chores - Create new chore with core data only
    • PATCH /api/chores/:id - Update chore core data (title, description, clam_value)
    • DELETE /api/chores/:id - Delete chore and cascade delete schedules and history
Chore Schedules endpoints (new):
    • GET /api/chore-schedules - Return all schedules with optional filters (user_id, visible, chore_id)
    • GET /api/chore-schedules/:id - Get single schedule
    • POST /api/chore-schedules - Create new schedule (requires chore_id, optional user_id, crontab, visible)
    • PATCH /api/chore-schedules/:id - Update schedule (any field including visible toggle)
    • DELETE /api/chore-schedules/:id - Delete schedule
    • POST /api/chore-schedules/bulk - Create multiple schedules at once (for assigning same chore to multiple users)
Chore History endpoints (new):
    • GET /api/chore-history - Return history entries with optional filters (user_id, date, date_range)
    • GET /api/chore-history/user/:userId - Get all history for a specific user
    • GET /api/chore-history/summary/:userId - Get clam total summary for user (sum of clam_value)
    • POST /api/chore-history - Create new history entry (chore completion or manual adjustment)
    • DELETE /api/chore-history/:id - Delete single history entry
    • POST /api/chore-history/reduce-clams - Reduce user clams by removing oldest entries until amount is met
Update completion tracking endpoint:
    • POST /api/chores/complete - New endpoint to mark chore as completed
        ◦ Takes: chore_schedule_id, user_id, date
        ◦ Validates schedule exists and is visible
        ◦ Creates chore_history entry with clam_value from associated chore
        ◦ If schedule.crontab is NULL (one-time task), set schedule.visible = false
        ◦ Calculate and apply completion bonus (check if all regular chores completed for user/day)
        ◦ Return updated clam total
    • POST /api/chores/uncomplete - New endpoint to undo completion
        ◦ Takes: chore_schedule_id, user_id, date
        ◦ Find and delete matching chore_history entry
        ◦ If schedule.crontab is NULL, set schedule.visible = true
        ◦ Recalculate clam total (query sum from history)
        ◦ Return updated clam total
User clam management endpoints:
    • GET /api/users/:id/clams - Get current clam total (sum from chore_history)
    • POST /api/users/:id/clams/add - Add clams (creates history entry with no chore_schedule_id)
    • POST /api/users/:id/clams/reduce - Reduce clams by removing oldest history entries

4. Frontend Dependencies
Add cron-parser package:
    • Run: npm install cron-parser --save in client directory
    • Import in components that need to parse/validate crontab expressions
    • Use parseExpression(crontab).next().toDate() to get next occurrence
    • Handle timezone considerations (use UTC or local timezone consistently)

5. Frontend UI - Admin Panel Schedule Management
Add "Schedules" tab to AdminPanel:
    • Create new tab in tabs array (between "Users" and "Prizes")
    • Display table/list of all chore_schedules with columns:
        ◦ Chore Title (from joined chores table)
        ◦ Assigned User (username or "Unassigned" if null)
        ◦ Crontab Expression
        ◦ Next Occurrence (calculated from crontab)
        ◦ Visible Status (toggle switch)
        ◦ Actions (Edit, Delete, Copy)
Schedule creation/edit interface:
    • User dropdown selector (include "Unassigned" option for user_id = null)
    • Chore dropdown selector (from all available chores)
    • Crontab expression input:
        ◦ Text field for manual crontab entry
        ◦ Helper interface with checkboxes/dropdowns for common patterns:
            ▪ Day of week selectors (generate "0 0 * * 1,3,5" for Mon/Wed/Fri)
            ▪ Interval selector (every N days: "0 0 */N * *")
            ▪ Specific dates selector
        ◦ Validation using cron-parser before saving
        ◦ Display "Next occurrence" preview as user types
    • Visible toggle checkbox
    • Copy button to duplicate schedule with ability to change user_id
Crontab helper presets:
    • Daily: "0 0 * * *"
    • Every other day: "0 0 */2 * *"
    • Weekdays: "0 0 * * 1-5"
    • Weekends: "0 0 * * 0,6"
    • Specific days: Allow checkbox selection that generates expression
    • One-time task: Leave crontab empty/null

6. Frontend UI - Chore Creation Updates
Update "Add New Chore" dialog in ChoreWidget:
    • Separate into two modes:
        ◦ "Create Chore Only" - Just creates the chore definition
        ◦ "Create Chore with Schedule" - Creates chore and schedule together (default)
    • Mode selector (radio buttons or tab interface)
"Create Chore Only" mode:
    • Title field
    • Description field
    • Clam value field
    • Creates chore in chores table only
    • Success message: "Chore created. Add schedules in Admin Panel."
"Create Chore with Schedule" mode:
    • All fields from "Chore Only" mode plus:
    • User selector (or "Unassigned")
    • Schedule options:
        ◦ Simple: Day of week checkboxes (generates basic crontab)
        ◦ Advanced: Manual crontab entry with validation
        ◦ One-time: Checkbox to leave crontab null
    • Creates both chore and schedule(s)
    • If multiple days selected, creates multiple schedule entries

7. Frontend Logic - Widget Loading and Display
Update ChoreWidget data fetching:
    • Fetch three datasets on load:
        ◦ All chores (GET /api/chores)
        ◦ All schedules (GET /api/chore-schedules?visible=true)
        ◦ Today's history (GET /api/chore-history?date=YYYY-MM-DD)
    • Store in separate state variables
Calculate visible chores for each user:
    • Get current date (date-only, format: YYYY-MM-DD)
    • For each user:
        ◦ Filter chore_schedules where (user_id = user.id OR user_id IS NULL) AND visible = true
        ◦ For each schedule:
            ▪ If crontab is NOT null:
                • Use cron-parser: parseExpression(schedule.crontab).prev().toDate()
                • Check if prev occurrence date = current date
                • If yes, schedule should appear today
            ▪ If crontab IS null:
                • One-time task, show if visible = true
        ◦ Create chore display object by joining with chores table data
        ◦ Add to user's chore list for today
Mark chores as completed:
    • For each chore_history entry where date = today:
        ◦ If chore_schedule_id exists:
            ▪ Find corresponding chore in user's list and mark as completed
            ▪ Set completed flag to true for UI display
        ◦ If chore_schedule_id is null (manual clam entry):
            ▪ Don't display as a chore, just count toward clam total
            ▪ (These are bonus clam adjustments, not actual chores)
Calculate user clam totals:
    • For each user:
        ◦ Sum all chore_history.clam_value where user_id = user.id
        ◦ Display total in user avatar chip
        ◦ Update in real-time when chores are completed/uncompleted

8. Frontend Logic - Chore Completion Handling
When user checks off a chore:
    • Call POST /api/chores/complete with:
        ◦ chore_schedule_id (from the schedule that generated this chore)
        ◦ user_id
        ◦ date (today's date)
    • Backend creates chore_history entry
    • Backend checks if schedule.crontab is null:
        ◦ If yes, set schedule.visible = false (hide one-time task)
    • Backend checks for completion bonus:
        ◦ Query all schedules for this user that should appear today
        ◦ Check if all have history entries for today
        ◦ If yes, add bonus history entry (+2 clams typically)
    • Refresh chore_history data
    • Update UI to show chore as completed
    • Update clam total display
When user unchecks a chore:
    • Call POST /api/chores/uncomplete with same parameters
    • Backend finds and deletes matching chore_history entry
    • Backend checks if schedule.crontab is null:
        ◦ If yes, set schedule.visible = true (re-show one-time task)
    • Backend recalculates clam total from remaining history
    • Remove any completion bonus if no longer all complete
    • Refresh chore_history data
    • Update UI to show chore as incomplete
    • Update clam total display

9. Frontend Logic - Clam Management
When reducing user clams (prize redemption):
    • Call POST /api/users/:id/clams/reduce with amount
    • Backend logic:
        ◦ Query chore_history for user_id, ordered by created_at ASC (oldest first)
        ◦ Iterate through entries:
            ▪ If entry.clam_value <= remaining_amount:
                • Delete entire entry
                • Subtract entry.clam_value from remaining_amount
            ▪ Else (entry.clam_value > remaining_amount):
                • Update entry: clam_value = clam_value - remaining_amount
                • Set remaining_amount = 0
                • Break loop
        ◦ Return new clam total
    • Update UI with new clam total
When adding bonus clams:
    • Call POST /api/users/:id/clams/add with amount
    • Backend creates chore_history entry:
        ◦ user_id = specified user
        ◦ chore_schedule_id = NULL
        ◦ date = current date
        ◦ clam_value = specified amount
    • Return new clam total
    • Update UI with new clam total

10. Backend Helper Functions
Create crontab conversion helper:
    • Function to convert old repeat_type + day to crontab:
        ◦ convertOldScheduleToCrontab(repeat_type, day_of_week)
        ◦ Handle edge cases and return appropriate crontab string
Create schedule validation helper:
    • Function to validate crontab expressions using cron-parser
    • Return validation errors or success
    • Check for valid date ranges
Create clam calculation helper:
    • Function to calculate total clams for a user from chore_history
    • Efficient query with SUM aggregate
    • Cache results if needed for performance

Summary and Benefits
This restructuring transforms the chores system from a date-specific, pre-generated approach to a flexible, schedule-based system. Benefits include:
    • Separation of concerns (chore definitions, schedules, completion history)
    • Flexible scheduling using industry-standard crontab expressions
    • Multiple users can have the same chore on different schedules
    • Multiple users can be assigned the same chore on the same day
    • Proper history tracking enables undo, analytics, and fair clam deductions
    • One-time tasks are properly handled without deletion (just hidden)
    • Clam totals are calculated from authoritative history rather than cached values
    • System is more maintainable and extensible for future features
The migration should be done carefully with proper backups, and the changes should be tested thoroughly before deploying to production.
