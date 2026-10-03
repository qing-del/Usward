-- Existing title choices did not record which connection received consent.
-- Require a fresh choice before a newly enabled busy/free view can reveal them.
UPDATE calendar_event
SET share_title = FALSE, version = version + 1, updated_at = UTC_TIMESTAMP(6)
WHERE kind = 'PERSONAL' AND share_title = TRUE;
