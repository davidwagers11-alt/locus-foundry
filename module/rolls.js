export function getDifficultyLabel(difficulty) {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "hard") return "Hard";
  return "Medium";
}

export function getConsultedDie(difficulty, diceResults) {
  const sorted = [...diceResults].sort((a, b) => a - b);

  if (difficulty === "easy") return sorted[2];
  if (difficulty === "hard") return sorted[0];
  return sorted[1];
}

export function isCriticalSuccess(diceResults) {
  return diceResults.length === 3 && diceResults.every((d) => d === 6);
}

export function getResultText({ consultedDie, attributeValue, critical }) {
  if (critical) return "CRITICAL SUCCESS";
  return consultedDie > attributeValue ? "SUCCESS" : "FAILURE";
}

export function getFailedDiceIndices(diceResults, attributeValue) {
  return diceResults
    .map((value, index) => ({ value, index }))
    .filter((die) => die.value <= attributeValue)
    .map((die) => die.index);
}

export function getRerollLimit(stress) {
  if (stress === "stressed") return 1;
  if (stress === "tense") return 2;
  return 3;
}

export function buildRollContent({
  actorName,
  attributeLabel,
  difficulty,
  diceResults,
  consultedDie,
  attributeValue,
  resultText,
  stress,
  willpower,
  canReroll,
  note = ""
}) {
  const difficultyLabel = getDifficultyLabel(difficulty);

  return `
    <div class="locus-roll-card">
      <h3>${actorName} - ${attributeLabel} Check</h3>
      <p><strong>Difficulty:</strong> ${difficultyLabel}</p>
      <p><strong>Dice:</strong> ${diceResults.join(", ")}</p>
      <p><strong>Consulted Die:</strong> ${consultedDie}</p>
      <p><strong>Target:</strong> Greater than ${attributeValue}</p>
      <p><strong>Result:</strong> ${resultText}</p>
      <p><strong>Stress:</strong> ${stress}</p>
      <p><strong>Willpower:</strong> ${willpower}</p>
      ${note ? `<p><em>${note}</em></p>` : ""}
      ${
        canReroll
          ? `<div class="locus-roll-actions">
               <button type="button" class="locus-reroll-button">Spend 1 WP to Reroll</button>
             </div>`
          : ""
      }
    </div>
  `;
