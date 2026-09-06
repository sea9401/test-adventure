# Daily quest reward dot

Feedback #600: show the existing character and `/quests` menu dots when the
daily bundle can be claimed. Use the same repeat quest derivation as the quest
screen, respecting notification preferences. Individual quest completion alone
must not trigger the dot; claimed rewards and previous-day progress must not
leave it active. Refresh the dashboard after loading updated quest state.

Implementation: extend dashboard save inputs and add a daily reward activity,
reuse `buildRepeatSignals` with only its required extras, then refresh the
dashboard from the quest view. No new visual styles or deployment.

- Add regression cases for ready, incomplete, claimed, and rolled-over rewards;
  run them before implementation to confirm the missing activity fails.
- Connect the shared reward calculation and quest refresh.
- Run dashboard, menu, quest, and repeat-quest tests, targeted lint and types;
  inspect the diff and commit on the current branch.
