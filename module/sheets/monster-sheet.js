<<<<<<< HEAD
export class LocusMonsterSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "actor", "monster"],
      template: "systems/locus-system/templates/actor/monster-sheet.html",
      width: 920,
      height: 760,
      resizable: true
    });
  }

  get title() {
    return `${this.actor.name} — Monster`;
  }

  getData(options = {}) {
    const context = super.getData(options);

    context.system = this.actor.system;
    context.isMonster = this.actor.type === "monster";

    context.monsterStats = [
      { key: "attack", label: "Attack" },
      { key: "search", label: "Search" },
      { key: "chase", label: "Chase" },
      { key: "resist", label: "Resist" }
    ];

    context.deathsDoorCapacities = [3, 6, 9, 12, 15, 18, 21, 24, 27];

    const ddValue = Number(this.actor.system.deathsDoor?.value ?? 0);
    const ddCapacity = Number(this.actor.system.deathsDoor?.capacity ?? 9);

    context.deathsDoorBoxes = Array.from({ length: 27 }, (_, i) => {
      const index = i + 1;
      return {
        index,
        filled: index <= ddValue,
        enabled: index <= ddCapacity
      };
    });

    context.inflictions = this.actor.items.filter((i) => i.type === "infliction");

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    html.find(".death-box").click(async (ev) => {
      const box = ev.currentTarget;
      if (box.classList.contains("is-disabled")) return;

      const clickedValue = Number(box.dataset.value);
      const currentValue = Number(this.actor.system.deathsDoor?.value ?? 0);

      const newValue =
        clickedValue === currentValue ? Math.max(0, currentValue - 1) : clickedValue;

      await this.actor.update({
        "system.deathsDoor.value": newValue
      });
    });

    html.find(".death-reset").click(async () => {
      await this.actor.update({
        "system.deathsDoor.value": 0
      });
    });

    html.find(".infliction-create").click(async () => {
      await this.actor.createEmbeddedDocuments("Item", [
        {
          name: "New Infliction",
          type: "infliction"
        }
      ]);
    });

    html.find(".infliction-use").click(async (ev) => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;

      const attribute = item.system.attribute || "Attribute";
      const difficulty = item.system.difficulty || "Medium";
      const inflictionName = item.name || "Infliction";

      const attributeLabel =
        attribute.charAt(0).toUpperCase() + attribute.slice(1);
      const difficultyLabel =
        difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

      await ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  flavor: `${this.actor.name} uses ${inflictionName}`,
  content: `
    <div class="locus-roll-card locus-infliction-chat-card">
      <p><strong>${this.actor.name}</strong> uses <strong>${inflictionName}</strong>.</p>
      <p>Roll <strong>${attributeLabel}</strong>, <strong>${difficultyLabel}</strong> to avoid <strong>${inflictionName}</strong>.</p>

      <button
        type="button"
        class="locus-infliction-roll"
        data-attribute="${attribute}"
        data-difficulty="${difficulty}"
        data-infliction="${inflictionName}"
      >
        🎲 Roll ${attributeLabel}
      </button>
    </div>
  `
});
    });

    html.find(".infliction-edit").click((ev) => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (item) item.sheet.render(true);
    });

    html.find(".infliction-delete").click(async (ev) => {
      const id = ev.currentTarget.dataset.itemId;
      await this.actor.deleteEmbeddedDocuments("Item", [id]);
    });

    html.find(".monster-roll").click(async (ev) => {
      const statKey = ev.currentTarget.dataset.stat;
      const statData = this.actor.system[statKey];

      const attributeValue = Number(statData?.value ?? 0);
      const descriptor = statData?.descriptor ?? "";
      const label = statKey.charAt(0).toUpperCase() + statKey.slice(1);

      if (attributeValue <= 0) {
        ui.notifications.warn(`${label} has no value to roll.`);
        return;
      }

      const roll = await new Roll("3d6").evaluate({ async: true });

      if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
      }

      const dice = roll.terms?.[0]?.results?.map((r) => r.result) ?? [];
      const sortedDice = [...dice].sort((a, b) => a - b);

      const successDice = sortedDice.filter((die) => die > attributeValue);
      const failDice = sortedDice.filter((die) => die <= attributeValue);

      const successes = successDice.length;
      const critical = sortedDice.length === 3 && sortedDice.every((die) => die === 6);

      let resultText = `${successes} Success${successes === 1 ? "" : "es"}`;
      if (critical) resultText = "Critical Success";

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${label} Roll`,
        content: `
          <div class="locus-roll-card">
            <p><strong>${this.actor.name}</strong> rolls <strong>${label}</strong>${descriptor ? ` (${descriptor})` : ""}.</p>
            <p><strong>Dice:</strong> [${sortedDice.join(", ")}]</p>
            <p><strong>Target Number:</strong> ${attributeValue}</p>
            <p><strong>Successful Dice:</strong> ${successDice.length ? successDice.join(", ") : "None"}</p>
            <p><strong>Failed Dice:</strong> ${failDice.length ? failDice.join(", ") : "None"}</p>
            <p><strong>Result:</strong> ${resultText}</p>
          </div>
        `
      });
    });
  }
=======
export class LocusMonsterSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "actor", "monster"],
      template: "systems/locus-system/templates/actor/monster-sheet.html",
      width: 920,
      height: 760,
      resizable: true
    });
  }

  get title() {
    return `${this.actor.name} — Monster`;
  }

  getData(options = {}) {
    const context = super.getData(options);

    context.system = this.actor.system;
    context.isMonster = this.actor.type === "monster";

    context.monsterStats = [
      { key: "attack", label: "Attack" },
      { key: "search", label: "Search" },
      { key: "chase", label: "Chase" },
      { key: "resist", label: "Resist" }
    ];

    context.deathsDoorCapacities = [3, 6, 9, 12, 15, 18, 21, 24, 27];

    const ddValue = Number(this.actor.system.deathsDoor?.value ?? 0);
    const ddCapacity = Number(this.actor.system.deathsDoor?.capacity ?? 9);

    context.deathsDoorBoxes = Array.from({ length: 27 }, (_, i) => {
      const index = i + 1;
      return {
        index,
        filled: index <= ddValue,
        enabled: index <= ddCapacity
      };
    });

    context.inflictions = this.actor.items.filter((i) => i.type === "infliction");

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    html.find(".death-box").click(async (ev) => {
      const box = ev.currentTarget;
      if (box.classList.contains("is-disabled")) return;

      const clickedValue = Number(box.dataset.value);
      const currentValue = Number(this.actor.system.deathsDoor?.value ?? 0);

      const newValue =
        clickedValue === currentValue ? Math.max(0, currentValue - 1) : clickedValue;

      await this.actor.update({
        "system.deathsDoor.value": newValue
      });
    });

    html.find(".death-reset").click(async () => {
      await this.actor.update({
        "system.deathsDoor.value": 0
      });
    });

    html.find(".infliction-create").click(async () => {
      await this.actor.createEmbeddedDocuments("Item", [
        {
          name: "New Infliction",
          type: "infliction"
        }
      ]);
    });

    html.find(".infliction-use").click(async (ev) => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;

      const attribute = item.system.attribute || "Attribute";
      const difficulty = item.system.difficulty || "Medium";
      const inflictionName = item.name || "Infliction";

      const attributeLabel =
        attribute.charAt(0).toUpperCase() + attribute.slice(1);
      const difficultyLabel =
        difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

      await ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  flavor: `${this.actor.name} uses ${inflictionName}`,
  content: `
    <div class="locus-roll-card locus-infliction-chat-card">
      <p><strong>${this.actor.name}</strong> uses <strong>${inflictionName}</strong>.</p>
      <p>Roll <strong>${attributeLabel}</strong>, <strong>${difficultyLabel}</strong> to avoid <strong>${inflictionName}</strong>.</p>

      <button
        type="button"
        class="locus-infliction-roll"
        data-attribute="${attribute}"
        data-difficulty="${difficulty}"
        data-infliction="${inflictionName}"
      >
        🎲 Roll ${attributeLabel}
      </button>
    </div>
  `
});
    });

    html.find(".infliction-edit").click((ev) => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (item) item.sheet.render(true);
    });

    html.find(".infliction-delete").click(async (ev) => {
      const id = ev.currentTarget.dataset.itemId;
      await this.actor.deleteEmbeddedDocuments("Item", [id]);
    });

    html.find(".monster-roll").click(async (ev) => {
      const statKey = ev.currentTarget.dataset.stat;
      const statData = this.actor.system[statKey];

      const attributeValue = Number(statData?.value ?? 0);
      const descriptor = statData?.descriptor ?? "";
      const label = statKey.charAt(0).toUpperCase() + statKey.slice(1);

      if (attributeValue <= 0) {
        ui.notifications.warn(`${label} has no value to roll.`);
        return;
      }

      const roll = await new Roll("3d6").evaluate({ async: true });

      if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
      }

      const dice = roll.terms?.[0]?.results?.map((r) => r.result) ?? [];
      const sortedDice = [...dice].sort((a, b) => a - b);

      const successDice = sortedDice.filter((die) => die > attributeValue);
      const failDice = sortedDice.filter((die) => die <= attributeValue);

      const successes = successDice.length;
      const critical = sortedDice.length === 3 && sortedDice.every((die) => die === 6);

      let resultText = `${successes} Success${successes === 1 ? "" : "es"}`;
      if (critical) resultText = "Critical Success";

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${label} Roll`,
        content: `
          <div class="locus-roll-card">
            <p><strong>${this.actor.name}</strong> rolls <strong>${label}</strong>${descriptor ? ` (${descriptor})` : ""}.</p>
            <p><strong>Dice:</strong> [${sortedDice.join(", ")}]</p>
            <p><strong>Target Number:</strong> ${attributeValue}</p>
            <p><strong>Successful Dice:</strong> ${successDice.length ? successDice.join(", ") : "None"}</p>
            <p><strong>Failed Dice:</strong> ${failDice.length ? failDice.join(", ") : "None"}</p>
            <p><strong>Result:</strong> ${resultText}</p>
          </div>
        `
      });
    });
  }
>>>>>>> 60a8c33e340506e04a93be96f090995ec22a958d
}