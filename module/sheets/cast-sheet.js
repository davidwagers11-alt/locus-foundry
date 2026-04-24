import {
  getConsultedDie,
  isCriticalSuccess,
  getResultText,
  getFailedDiceIndices,
  buildRollContent
} from "../rolls.js";

export class LocusCastSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "actor", "cast"],
      template: "systems/locus-system/templates/actor/cast-sheet.html",
      width: 900,
      height: 900,
      tabs: [
        {
          navSelector: ".tabs",
          contentSelector: ".locus-tab-body",
          initial: "attributes"
        }
      ]
    });
  }

  getData() {
    const context = super.getData();

    const hand = foundry.utils.deepClone(
      this.actor.getFlag("locus-system", "hand") ?? []
    );

    context.system = this.actor.system;
    context.isGM = game.user.isGM;
    context.hand = hand;
    context.handCount = hand.length;

    context.items = this.actor.items
      .filter(item => item.type === "item")
      .map(item => item.toObject());

    context.skills = this.actor.items
      .filter(item => item.type === "skill")
      .map(skill => {
        const skillData = skill.toObject();

        const typeLabels = {
          trained: "Trained",
          knowledge: "Knowledge",
          expertise: "Expertise",
          specialty: "Specialty"
        };

        skillData.system.typeLabel =
          typeLabels[skillData.system.skillType] || skillData.system.skillType;

        skillData.system.summary = this._getSkillSummary(skillData);

        return skillData;
      });

    return context;
  }

  _getSkillSummary(skill) {
    const data = skill.system ?? {};

    switch (data.skillType) {
      case "trained":
        return data.reminderText || "No Ignorance Check required for trained tasks.";

      case "knowledge":
        return data.reminderText || "Treat Ignorance as 1 for related checks.";

      case "expertise":
        return data.reminderText || "Checks in this field are always Easy.";

      case "specialty": {
        const attr = data.linkedAttribute || "attribute";
        const label = attr.charAt(0).toUpperCase() + attr.slice(1);
        return data.reminderText || `Reduce ${label} by 1 for this narrow use.`;
      }

      default:
        return data.reminderText || "";
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    this._applyVisualState(html);

    html.find(".roll-attribute").on("click", this._onRollAttribute.bind(this));
    html.find(".locus-attribute-dot").on("click", this._onAttributeDotClick.bind(this));
    html.find(".locus-death-box").on("click", this._onDeathTrackClick.bind(this));
    html.find(".locus-death-reset").on("click", this._onDeathReset.bind(this));
    html.find(".draw-card-button").on("click", this._onDrawCard.bind(this));
    html.find(".discard-card-button").on("click", this._onDiscardCard.bind(this));

    html.find(".item-create").on("click", this._onItemCreate.bind(this));
    html.find(".item-delete").on("click", this._onItemDelete.bind(this));
    html.find(".item-edit").on("click", this._onItemEdit.bind(this));
    html.find(".item-use").on("click", this._onItemUse.bind(this));
    html.find(".locus-durability-box").on("click", this._onDurabilityClick.bind(this));

    html.on("drop", this._onDrop.bind(this));
  }

  _applyVisualState(html) {
    const root = html.closest(".locus-system");

    if (!root.length) return;

    root.removeClass((i, className) =>
      (className.match(/stress-\S+|death-\d+/g) || []).join(" ")
    );

    const stress = this.actor.system.resources?.stress?.value ?? "uneasy";
    root.addClass(`stress-${stress}`);

    const deathValue = this.actor.system.death?.value ?? 0;
    root.addClass(`death-${deathValue}`);
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);

    if (data.type !== "Item") return;

    const item = await Item.fromDropData(data);
    if (!item) return;

    await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    await this.render(false);
  }

  async _onDeathReset(event) {
    event.preventDefault();

    const confirmed = await Dialog.confirm({
      title: "Reset Death's Door",
      content: "<p>Reset Death's Door to 0?</p>"
    });

    if (!confirmed) return;

    await this.actor.update({
      "system.death.value": 0
    });

    await this.render(false);
  }

  async _onItemCreate(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const type = button.dataset.type || "item";

    let itemData = {
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type
    };

    if (type === "item") {
      itemData.system = {
        size: 1,
        damageType: "",
        quality: "medium",
        durability: {
          value: 0,
          max: 8
        },
        damaged: false,
        destroyed: false,
        description: ""
      };
    }

    if (type === "skill") {
      itemData.system = {
        skillType: "trained",
        linkedAttribute: "",
        reminderText: "",
        description: "",
        automation: {
          enabled: false,
          mode: "none",
          effect: ""
        }
      };
    }

    await this.actor.createEmbeddedDocuments("Item", [itemData]);
    await this.render(false);
  }

  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);

    const itemUpdates = [];
    const itemsData = expanded.items ?? {};

    for (const [itemId, itemData] of Object.entries(itemsData)) {
      itemUpdates.push({
        _id: itemId,
        ...itemData
      });
    }

    if (itemUpdates.length) {
      await this.actor.updateEmbeddedDocuments("Item", itemUpdates);
    }

    delete expanded.items;

    return super._updateObject(event, foundry.utils.flattenObject(expanded));
  }

  async _onItemDelete(event) {
    event.preventDefault();

    const card = event.currentTarget.closest("[data-item-id]");
    const itemId = card?.dataset?.itemId;

    if (!itemId) {
      ui.notifications.warn("No item found to delete.");
      return;
    }

    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
    await this.render(false);
  }

  _onItemEdit(event) {
    event.preventDefault();

    const card = event.currentTarget.closest("[data-item-id]");
    const itemId = card?.dataset?.itemId;

    if (!itemId) {
      ui.notifications.warn("No item found to edit.");
      return;
    }

    const item = this.actor.items.get(itemId);
    if (!item) {
      ui.notifications.warn("Item could not be found.");
      return;
    }

    item.sheet.render(true);
  }

  async _onItemUse(event) {
    event.preventDefault();

    const card = event.currentTarget.closest(".locus-item-card");
    const itemId = card?.dataset?.itemId;

    if (!itemId) {
      ui.notifications.warn("No item found to use.");
      return;
    }

    const item = this.actor.items.get(itemId);
    if (!item) {
      ui.notifications.warn("Item could not be found.");
      return;
    }

    const currentValue = Number(item.system?.durability?.value ?? 0);
    const maxValue = Number(item.system?.durability?.max ?? 8);
    const quality = item.system?.quality ?? "medium";
    const damaged = item.system?.damaged === true;
    const destroyed = item.system?.destroyed === true;

    if (destroyed) {
      ui.notifications.warn(`${item.name} is destroyed and cannot be used.`);
      return;
    }

    // Normal use before item becomes damaged
    if (!damaged) {
      const newValue = Math.min(currentValue + 1, maxValue);
      const becomesDamaged = newValue >= maxValue;

      await item.update({
        "system.durability.value": newValue,
        "system.damaged": becomesDamaged
      });

      if (becomesDamaged) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: `${item.name} Damaged`,
          content: `
            <div class="locus-chat-card">
              <h3>Item Damaged</h3>
              <p><strong>${this.actor.name}</strong> uses <strong>${item.name}</strong>.</p>
              <p>The item has reached maximum durability loss and is now <strong>Damaged</strong>.</p>
            </div>
          `
        });
      }

      await this.render(false);
      return;
    }

    // Damaged item use
    const roll = await new Roll("3d6").evaluate();

    if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }

    const diceResults = roll.dice[0].results
      .map(r => r.result)
      .sort((a, b) => a - b);

    const consultedDie = getConsultedDie(quality, diceResults);
    const success = consultedDie >= 4;

    if (success) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${item.name} (Damaged Use)`,
        content: `
          <div class="locus-chat-card">
            <h3>Damaged Item Use</h3>
            <p><strong>${this.actor.name}</strong> uses <strong>${item.name}</strong>.</p>
            <p>Quality: <strong>${quality.charAt(0).toUpperCase() + quality.slice(1)}</strong></p>
            <p>Roll: <strong>${diceResults.join(", ")}</strong></p>
            <p>Consulted die: <strong>${consultedDie}</strong></p>
            <p>Result: <strong>Success</strong> (4+)</p>
          </div>
        `
      });

      await this.render(false);
      return;
    }

    // Failed damaged use: item becomes destroyed
    await item.update({
      "system.destroyed": true,
      "system.damaged": true
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${item.name} Destroyed`,
      content: `
        <div class="locus-chat-card">
          <h3>Damaged Item Use</h3>
          <p><strong>${this.actor.name}</strong> uses <strong>${item.name}</strong>.</p>
          <p>Quality: <strong>${quality.charAt(0).toUpperCase() + quality.slice(1)}</strong></p>
          <p>Roll: <strong>${diceResults.join(", ")}</strong></p>
          <p>Consulted die: <strong>${consultedDie}</strong></p>
          <p>Result: <strong>Failure</strong> (below 4)</p>
          <p><strong>${item.name}</strong> is now <strong>Destroyed</strong>.</p>
        </div>
      `
    });

    await this.render(false);
    return;
  }

  async _onDurabilityClick(event) {
    event.preventDefault();

    const box = event.currentTarget;
    const index = Number(box.dataset.index);
    const itemId = box.closest(".locus-durability-track").dataset.itemId;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newValue = index + 1;
    const max = item.system.durability.max;

    await item.update({
      "system.durability.value": newValue,
      "system.damaged": newValue >= max
    });

    await this.render(false);
  }

  _buildDrawCardMessage(result) {
    let message = `<p><strong>${this.actor.name}</strong> draws a card.</p>`;

    if (result.hauntMatches?.length > 0) {
      const hauntCards = result.hauntMatches
        .map(card => card.label ?? `${card.value ?? card.rank ?? "Unknown"} of ${card.suit ?? "Unknown"}`)
        .join(", ");

      message += `<p>Haunt triggered: <strong>${hauntCards}</strong>.</p>`;
    }

    if (result.virtueMatches?.length > 0) {
      const virtueCards = result.virtueMatches
        .map(card => card.label ?? `${card.value ?? card.rank ?? "Unknown"} of ${card.suit ?? "Unknown"}`)
        .join(", ");

      message += `<p>Virtue triggered: <strong>${virtueCards}</strong>. Card discarded, +${result.willpowerGained} Willpower.</p>`;
    }

    if (
      (!result.hauntMatches || result.hauntMatches.length === 0) &&
      (!result.virtueMatches || result.virtueMatches.length === 0) &&
      result.drawn?.length > 0
    ) {
      const drawnCards = result.drawn
        .map(card => card.label ?? `${card.value ?? card.rank ?? "Unknown"} of ${card.suit ?? "Unknown"}`)
        .join(", ");

      message += `<p>Drawn: <strong>${drawnCards}</strong>.</p>`;
    }

    return message;
  }

  async _onDrawCard(event) {
    event.preventDefault();

    if (game.user.isGM) {
      const result = await game.locusSystem.deck.drawToActor(this.actor, 1);
      await this.render(false);

      if (!result) return;

      const message = this._buildDrawCardMessage(result);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: message
      });

      return;
    }

    game.socket.emit("system.locus-system", {
      type: "drawCard",
      actorId: this.actor.id,
      count: 1,
      userId: game.user.id
    });

    ui.notifications.info("Draw request sent.");
  }

  async _onDiscardCard(event) {
    event.preventDefault();

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can discard cards right now.");
      return;
    }

    const button = event.currentTarget;
    const cardId = button.dataset.cardId;

    if (!cardId) {
      ui.notifications.warn("No card id found for discard.");
      return;
    }

    button.disabled = true;

    try {
      const result = await game.locusSystem.deck.requestDiscardCard(this.actor.id, cardId);

      if (result?.ok || result?.requested) {
        await this.render(false);
      }
    } catch (error) {
      console.error("Locus System | Discard failed", error);
      ui.notifications.error("Failed to discard card. Check console.");
    } finally {
      button.disabled = false;
    }
  }

  async _onAttributeDotClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const dot = event.currentTarget;
    const track = dot.closest(".locus-attribute-dots");
    const attributeKey = track?.dataset?.attribute;
    const value = Number(dot.dataset.value);

    console.log("attributeKey:", attributeKey);
    console.log("value:", value);
    console.log("track:", track);

    if (!attributeKey) {
      ui.notifications.warn("No attribute found.");
      return;
    }

    await this.actor.update({
      [`system.attributes.${attributeKey}.value`]: value
    });

    await this.render(false);
  }

  async _onDeathTrackClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const box = event.currentTarget;
    const value = Number(box.dataset.value);
    const max = Number(this.actor.system.death?.max ?? 27);

    const newValue = Math.min(value, max);

    await this.actor.update({
      "system.death.value": newValue
    });

    await this.render(false);
  }

  async _onRollAttribute(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const attributeKey = button.dataset.attribute;
    const attributeLabel = button.dataset.label;

    const attributeValue = this.actor.system.attributes?.[attributeKey]?.value ?? 0;

    const difficultySelect = this.element.find(".roll-difficulty");
    const difficulty = difficultySelect.val() || "medium";

    const roll = await new Roll("3d6").evaluate();

    if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }

    const diceResults = roll.dice[0].results
      .map((r) => r.result)
      .sort((a, b) => a - b);

    const consultedDie = getConsultedDie(difficulty, diceResults);
    const critical = isCriticalSuccess(diceResults);
    const resultText = getResultText({
      consultedDie,
      attributeValue,
      critical
    });

    const stress = this.actor.system.resources?.stress?.value ?? "uneasy";
    const willpower = this.actor.system.resources?.willpower?.value ?? 0;
    const failedDice = getFailedDiceIndices(diceResults, attributeValue);

    const canReroll = !critical && failedDice.length > 0 && willpower > 0;

    const content = buildRollContent({
      actorName: this.actor.name,
      attributeLabel,
      difficulty,
      diceResults,
      consultedDie,
      attributeValue,
      resultText,
      stress,
      willpower,
      canReroll
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${attributeLabel} Check`,
      content,
      flags: {
        "locus-system": {
          rollData: {
            actorId: this.actor.id,
            attributeKey,
            attributeLabel,
            attributeValue,
            difficulty,
            diceResults
          }
        }
      }
    });
  }
