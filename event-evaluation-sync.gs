/**
 * Digital Transparence Board — evaluation Sheet -> Supabase sync.
 *
 * Install once PER EVENT (each event has its own Form + linked Sheet):
 *   1. Open the Sheet the Form writes to.
 *   2. Extensions > Apps Script. Delete any starter code, paste this in.
 *   3. Fill in the four CONFIG constants below for this event.
 *   4. Left sidebar > Triggers (clock icon) > + Add Trigger:
 *        Function:        onFormSubmit
 *        Event source:    From spreadsheet
 *        Event type:      On form submit
 *      Save, then authorize when prompted.
 *   5. Submit a test response through the Form and confirm a row lands
 *      in Supabase's event_evaluations table.
 *
 * The service role key lives ONLY here (Apps Script's project, never in
 * the deployed app), so it's safe to use it to bypass RLS on insert —
 * same trust boundary as create-officers.mjs / the invite-officer script.
 */

// ---- CONFIG — set these four for this specific event's Form/Sheet ----
const EVENT_ID = "PASTE_THIS_EVENT'S_events.id_HERE";
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "PASTE_SERVICE_ROLE_KEY_HERE"; // Project Settings > API
// Must exactly match the Form's question titles.
const NAME_QUESTION = "Student Name";
const STUDENT_ID_QUESTION = "Student ID";
// ------------------------------------------------------------------

function onFormSubmit(e) {
  const answers = e.namedValues; // { "Question title": ["answer"] }

  const rawName = (answers[NAME_QUESTION] || [""])[0];
  const rawStudentId = (answers[STUDENT_ID_QUESTION] || [""])[0];

  const studentName = rawName.trim().toLowerCase();
  const studentId = rawStudentId.trim().toLowerCase();

  if (!studentName || !studentId) {
    console.error("Missing name or student ID in response:", answers);
    return;
  }

  const payload = {
    id: Utilities.getUuid(),
    event_id: EVENT_ID,
    student_id: studentId,
    student_name: studentName,
    submitted_at: new Date().toISOString(),
  };

  // on_conflict + Prefer: resolution=merge-duplicates = upsert, so a
  // student resubmitting the form updates their row instead of erroring
  // on the (event_id, student_id) unique constraint.
  const url =
    SUPABASE_URL + "/rest/v1/event_evaluations?on_conflict=event_id,student_id";

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status >= 300) {
    console.error("Supabase insert failed (" + status + "):", response.getContentText());
  }
}
