-- De-duplicate Participant rows before creating the unique index.
-- Keeps the most recent row per (eventId, userEmail), removing earlier duplicates.
DELETE FROM "Participant" a
USING "Participant" b
WHERE a."createdAt" < b."createdAt"
  AND a."eventId" = b."eventId"
  AND a."userEmail" = b."userEmail";

-- Hard guard: a user can join an event at most once.
CREATE UNIQUE INDEX "Participant_eventId_userEmail_key" ON "Participant"("eventId", "userEmail");