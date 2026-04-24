import { LocusCastSheet } from "./sheets/cast-sheet.js";
import { LocusMonsterSheet } from "./sheets/monster-sheet.js";
import { LocusItemSheet } from "./sheets/item-sheet.js";
import { LocusInflictionSheet } from "./sheets/infliction-sheet.js";
import {
  getConsultedDie,
  isCriticalSuccess,
  getResultText,
  getFailedDiceIndices,
  getRerollLimit,
  buildRollContent
} from "./rolls.js";

/* ---------------------------------------- */
/*  Locus Item Data Models                  */
/* ---------------------------------------- */

const {
  StringField,
  NumberField,
  BooleanField,
  SchemaField
} = foundry.data.fields;

class LocusItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      size: new NumberField({
        required: true,
        integer: true,
        min: 1,
        initial: 1
      }),
      damageType: new StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      quality: new StringField({
        required: true,
        blank: false,
        initial: "medium",
        choices: ["easy", "medium", "hard"]
      }),
      durability: new SchemaField({
        value: new NumberField({
          required: true,
          integer: true,
          min: 0,
          initial: 0
        }),
        max: new NumberField({
          required: true,
          integer: true,
          min: 1,
          initial: 8
        })
      }),
      damaged: new BooleanField({
        required: true,
        initial: false
      }),
      description: new StringField({
        required: false,
        blank: true,
        initial: ""
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.damaged = this.durability.value >= this.durability.max;
  }
}

class LocusInflictionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descriptor: new StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      attribute: new StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      condition: new StringField({
        required: false,
        blank: true,
        initial: ""
      }),
      difficulty: new StringField({
        required: true,
        blank: false,
        initial: "medium",
        choices: ["easy", "medium", "hard"]
      }),
      description: new StringField({
        required: false,
        blank: true,
        initial: ""
      })
    };
  }
}

/* ---------------------------------------- */
/*  Deck / Hand Helpers                     */
/* ---------------------------------------- */

function getSharedDeckState() {
  const deckState = game.settings.get("locus-system", "sharedDeck") || {
    initialized: false,
    decks: 1,
    drawPile: [],
    discardPile: []
  };

  return foundry.utils.deepClone(deckState);
}

async function setSharedDeckState(deckState) {
  await game.settings.set("locus-system", "sharedDeck", deckState);
}

function getActorHand(actor) {
  return foundry.utils.deepClone(actor.getFlag("locus-system", "hand") || []);
}

async function setActorHand(actor, hand) {
  await actor.setFlag("locus-system", "hand", hand);
}

function getCardDisplayLabel(card) {
  return card?.label ?? `${card?.value ?? card?.rank ?? "Unknown"} of ${card?.suit ?? "Unknown"}`;
}

function buildDrawCardMessage(actor, result) {
  let message = `<p><strong>${actor.name}</strong> draws a card.</p>`;

  if (result?.hauntMatches?.length > 0) {
    const hauntCards = result.hauntMatches
      .map((card) => getCardDisplayLabel(card))
      .join(", ");

    message += `<p>Haunt triggered: <strong>${hauntCards}</strong>.</p>`;
  }

  if (result?.virtueMatches?.length > 0) {
    const virtueCards = result.virtueMatches
      .map((card) => getCardDisplayLabel(card))
      .join(", ");

    message += `<p>Virtue triggered: <strong>${virtueCards}</strong>. Card discarded, +${result.willpowerGained} Willpower.</p>`;
  }

  if (
    (!result?.hauntMatches || result.hauntMatches.length === 0) &&
    (!result?.virtueMatches || result.virtueMatches.length === 0) &&
    result?.drawn?.length > 0
  ) {
    const drawnCards = result.drawn
      .map((card) => getCardDisplayLabel(card))
      .join(", ");

    message += `<p>Drawn: <strong>${drawnCards}</strong>.</p>`;
  }

  return message;
}

/**
 * Discard a single card from an actor's hand into the shared discard pile.
 * GM-only for now.
 */
async function discardCardFromHand(actor, cardId) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can discard cards right now.");
    return { ok: false, reason: "not-gm" };
  }

  if (!actor) {
    ui.notifications.error("Actor not found for discard.");
    return { ok: false, reason: "actor-not-found" };
  }

  const hand = getActorHand(actor);
  const cardIndex = hand.findIndex((c) => c.id === cardId);

  if (cardIndex === -1) {
    ui.notifications.warn("Card not found in actor hand.");
    return { ok: false, reason: "card-not-found" };
  }

  const [card] = hand.splice(cardIndex, 1);

  const deckState = getSharedDeckState();
  deckState.discardPile ??= [];
  deckState.discardPile.push(card);

  await setActorHand(actor, hand);
  await setSharedDeckState(deckState);

  const cardLabel =
    card.label ??
    `${card.value ?? card.rank ?? "Unknown Rank"} of ${card.suit ?? "Unknown Suit"}`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p><strong>${actor.name}</strong> discards <strong>${cardLabel}</strong>.</p>`
  });

  return { ok: true, card };
}

/**
 * Request discard through socket.
 * For now, only GM execution is allowed.
 * This gives us a safe path for future player permissions.
 */
async function requestDiscardCard(actorId, cardId) {
  if (!actorId || !cardId) return;

  if (game.user.isGM) {
    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error("Actor not found for discard.");
      return { ok: false, reason: "actor-not-found" };
    }

    return await discardCardFromHand(actor, cardId);
  }

  game.socket.emit("system.locus-system", {
    type: "discardCard",
    actorId,
    cardId,
    userId: game.user.id
  });

  return { ok: true, requested: true };
}

/* ---------------------------------------- */
/*  Initiative Helpers                      */
/* ---------------------------------------- */

function getLocusCarelessness(actor) {
  if (!actor) return 0;
  return Number(actor.system?.attributes?.carelessness?.value ?? 0);
}

function getLocusInitiativeActorType(actor) {
  if (!actor) return "unknown";
  if (actor.type === "cast" || actor.type === "foil") return "cast";
  if (actor.type === "monster") return "monster";
  return "other";
}

async function rollLocusInitiative(actor, { showDice = true } = {}) {
  if (!actor) {
    throw new Error("Cannot roll initiative without an actor.");
  }

  const roll = await new Roll("3d6").evaluate({ async: true });

  if (showDice && game.dice3d) {
    await game.dice3d.showForRoll(roll, game.user, true);
  }

  const dice = roll.terms?.[0]?.results?.map((r) => r.result) ?? [];
  const total = Number(roll.total ?? 0);

  const actorKind = getLocusInitiativeActorType(actor);
  const carelessness = actorKind === "cast" ? getLocusCarelessness(actor) : 0;
  const final = actorKind === "cast" ? total - carelessness : total;

  return {
    actorKind,
    dice,
    total,
    carelessness,
    final
  };
}

function buildInitiativeChatContent(actor, data) {
  const diceText = data.dice?.length ? data.dice.join(", ") : "—";

  if (data.actorKind === "cast") {
    return `
      <div class="locus-roll locus-initiative-roll">
        <h3>Initiative Roll</h3>
        <p><strong>${actor.name}</strong></p>
        <p>Rolled: <strong>${diceText}</strong></p>
        <p>Total: <strong>${data.total}</strong></p>
        <p>Carelessness: <strong>-${data.carelessness}</strong></p>
        <p>Final Initiative: <strong>${data.final}</strong></p>
      </div>
    `;
  }

  if (data.actorKind === "monster") {
    return `
      <div class="locus-roll locus-initiative-roll">
        <h3>Initiative Roll</h3>
        <p><strong>${actor.name}</strong></p>
        <p>Rolled: <strong>${diceText}</strong></p>
        <p>Monster Total: <strong>${data.final}</strong></p>
      </div>
    `;
  }

  return `
    <div class="locus-roll locus-initiative-roll">
      <h3>Initiative Roll</h3>
      <p><strong>${actor.name}</strong></p>
      <p>Rolled: <strong>${diceText}</strong></p>
      <p>Final Initiative: <strong>${data.final}</strong></p>
    </div>
  `;
}

async function rollMissingLocusInitiative(combat) {
  if (!combat) return null;

  const missingIds = combat.combatants
    .filter((c) => c.initiative === null || c.initiative === undefined)
    .map((c) => c.id);

  if (!missingIds.length) {
    ui.notifications.info("No combatants are missing initiative.");
    return combat;
  }

  return combat.rollInitiative(missingIds);
}

/* ---------------------------------------- */
/*  Init                                    */
/* ---------------------------------------- */

Hooks.once("init", function () {
  console.log("Locus System | Initializing");

  // Handlebars helpers
  Handlebars.registerHelper("lte", function (a, b) {
    return a <= b;
  });

  Handlebars.registerHelper("range", function (start, end) {
    const arr = [];
    for (let i = start; i < end; i++) {
      arr.push(i);
    }
    return arr;
  });

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  Handlebars.registerHelper("capitalize", function (value) {
    if (!value || typeof value !== "string") return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  });

  // Register system data models for custom Item subtypes
  CONFIG.Item.dataModels.item = LocusItemData;
  CONFIG.Item.dataModels.infliction = LocusInflictionData;

  // Safety net in case an item is created without an explicit subtype
  Hooks.on("preCreateItem", (document, data) => {
    if (data.type) return;

    document.updateSource({
      type: "item"
    });
  });

  // Actor sheets
  Actors.unregisterSheet("core", ActorSheet);

  Actors.registerSheet("locus-system", LocusCastSheet, {
    types: ["cast", "foil"],
    makeDefault: true
  });

  Actors.registerSheet("locus-system", LocusMonsterSheet, {
    types: ["monster"],
    makeDefault: true
  });

  // Item sheets
  Items.unregisterSheet("core", ItemSheet);

  Items.registerSheet("locus-system", LocusItemSheet, {
    types: ["item"],
    makeDefault: true
  });

  Items.registerSheet("locus-system", LocusInflictionSheet, {
    types: ["infliction"],
    makeDefault: true
  });

  game.settings.register("locus-system", "sharedDeck", {
    name: "Shared Deck State",
    hint: "Internal storage for the shared deck.",
    scope: "world",
    config: false,
    type: Object,
    default: {
      initialized: false,
      decks: 1,
      drawPile: [],
      discardPile: []
    }
  });

  Combat.prototype.rollInitiative = async function (ids, options = {}) {
    const combatantIds = typeof ids === "string"
      ? [ids]
      : Array.isArray(ids)
        ? ids
        : Array.from(ids ?? []);

    const resolvedIds = combatantIds.length
      ? combatantIds
      : this.combatants.map((c) => c.id);

    const updates = [];
    const messages = [];

    for (const id of resolvedIds) {
      const combatant = this.combatants.get(id);
      if (!combatant) continue;

      const actor = combatant.actor;
      if (!actor) continue;

      try {
        const initData = await rollLocusInitiative(actor, { showDice: true });

        updates.push({
          _id: combatant.id,
          initiative: initData.final
        });

        messages.push({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({
            actor,
            token: combatant.token?.object
          }),
          flavor: "Initiative",
          content: buildInitiativeChatContent(actor, initData)
        });
      } catch (error) {
        console.error(`Locus System | Initiative failed for ${combatant.name}`, error);
      }
    }

    if (updates.length) {
      await this.updateEmbeddedDocuments("Combatant", updates);
    }

    if (messages.length) {
      await ChatMessage.create(messages);
    }

    this.setupTurns();
    return this;
  };

  console.log("Locus System | Cast/Foil/Monster sheets registered");
  console.log("Locus System | Item data models registered: item, infliction");
});

/* ---------------------------------------- */
/*  Ready                                   */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  game.locusSystem = game.locusSystem || {};
  game.locusSystem.deck = game.locusSystem.deck || {};
  game.locusSystem.initiative = game.locusSystem.initiative || {};

  game.locusSystem.deck.getSharedDeckState = getSharedDeckState;
  game.locusSystem.deck.setSharedDeckState = setSharedDeckState;
  game.locusSystem.deck.getActorHand = getActorHand;
  game.locusSystem.deck.setActorHand = setActorHand;
  game.locusSystem.deck.discardCardFromHand = discardCardFromHand;
  game.locusSystem.deck.requestDiscardCard = requestDiscardCard;

  game.locusSystem.initiative.roll = rollLocusInitiative;
  game.locusSystem.initiative.rollMissing = rollMissingLocusInitiative;

  game.socket.on("system.locus-system", async (data) => {
    console.log("Locus System | Socket event received:", data);

    if (!data) return;
    if (!game.user.isGM) return;

    if (data.type === "drawCard") {
      const actor = game.actors.get(data.actorId);
      if (!actor) {
        console.warn("Locus System | Draw request failed: actor not found.");
        return;
      }

      console.log("Locus System | GM received draw request:", data);

      const result = await game.locusSystem.deck.drawToActor(actor, data.count ?? 1);

      await actor.sheet?.render(false);

      if (!result) return;

      const message = buildDrawCardMessage(actor, result);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: message
      });

      return;
    }

    if (data.type === "discardCard") {
      const actor = game.actors.get(data.actorId);
      if (!actor) {
        console.warn("Locus System | Discard request failed: actor not found.");
        return;
      }

      console.log("Locus System | GM received discard request:", data);

      await discardCardFromHand(actor, data.cardId);
      await actor.sheet?.render(false);

      return;
    }
  });

  console.log("Locus System | Ready");
});

/* ---------------------------------------- */
/*  Chat Handling                           */
/* ---------------------------------------- */

Hooks.on("renderChatMessage", (message, html) => {
  /* ---------------------------------------- */
  /*  Infliction Roll Button                  */
  /* ---------------------------------------- */

  html.find(".locus-infliction-roll").on("click", async (event) => {
    event.preventDefault();

    const button = event.currentTarget;
    const attributeKeyRaw = button.dataset.attribute ?? "";
    const difficultyRaw = button.dataset.difficulty ?? "medium";
    const inflictionName = button.dataset.infliction ?? "Infliction";

    const attributeKey = attributeKeyRaw.toLowerCase().trim();
    const difficulty = difficultyRaw.toLowerCase().trim();

    const playerActor =
      game.user.character ||
      canvas.tokens?.controlled?.[0]?.actor ||
      null;

    if (!playerActor) {
      ui.notifications.warn("Select a character or assign one to your user.");
      return;
    }

    const attributeData = playerActor.system.attributes?.[attributeKey];
    const attributeValue = Number(attributeData?.value ?? 0);

    if (!attributeData) {
      ui.notifications.warn(`${playerActor.name} does not have "${attributeKey}".`);
      return;
    }

    if (attributeValue <= 0) {
      ui.notifications.warn(`${playerActor.name}'s ${attributeKey} cannot be used.`);
      return;
    }

    const roll = await new Roll("3d6").evaluate({ async: true });

    if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.user, true);
    }

    const dice = roll.terms?.[0]?.results?.map((r) => r.result) ?? [];
    dice.sort((a, b) => a - b);

    let consultedDie = dice[1];
    if (difficulty === "easy") consultedDie = dice[0];
    if (difficulty === "hard") consultedDie = dice[2];

    const critical = dice.length === 3 && dice.every((d) => d === 6);
    const success = critical || consultedDie <= attributeValue;

    const resultText = critical
      ? "Critical Success"
      : success
        ? "Success"
        : "Failure";

    const attributeLabel =
      attributeKey.charAt(0).toUpperCase() + attributeKey.slice(1);

    const difficultyLabel =
      difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

    const failedDice = getFailedDiceIndices(dice, attributeValue);
    const canReroll = !critical && failedDice.length > 0;

    const content = buildRollContent({
      actorName: playerActor.name,
      attributeLabel,
      difficulty,
      diceResults: dice,
      consultedDie,
      attributeValue,
      resultText,
      stress: playerActor.system.resources?.stress?.value ?? "uneasy",
      willpower: playerActor.system.resources?.willpower?.value ?? 0,
      canReroll,
      note: `Resisting ${inflictionName}`
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: playerActor }),
      flavor: `${playerActor.name} resists ${inflictionName}`,
      content,
      flags: {
        "locus-system": {
          rollData: {
            actorId: playerActor.id,
            attributeKey,
            attributeLabel,
            attributeValue,
            difficulty,
            diceResults: dice
          }
        }
      }
    });
  });

  /* ---------------------------------------- */
  /*  Existing Reroll Handling                */
  /* ---------------------------------------- */

  const rollData = message.getFlag("locus-system", "rollData");
  if (!rollData) return;

  html.find(".locus-reroll-button").on("click", async (event) => {
    event.preventDefault();

    const actor = game.actors.get(rollData.actorId);
    if (!actor) {
      ui.notifications.error("Actor not found for reroll.");
      return;
    }

    const stress = actor.system.resources?.stress?.value ?? "uneasy";
    const willpower = actor.system.resources?.willpower?.value ?? 0;

    if (willpower < 1) {
      ui.notifications.warn("Not enough Willpower.");
      return;
    }

    const rerollLimit = getRerollLimit(stress);
    const failedIndices = getFailedDiceIndices(
      rollData.diceResults,
      rollData.attributeValue
    );

    if (!failedIndices.length) {
      ui.notifications.info("No failed dice available to reroll.");
      return;
    }

    const checkboxContent = failedIndices
      .map((index) => {
        const value = rollData.diceResults[index];
        return `
          <div class="locus-reroll-option">
            <label>
              <input type="checkbox" name="rerollDie" value="${index}" />
              Die ${index + 1}: ${value}
            </label>
          </div>
        `;
      })
      .join("");

    new Dialog({
      title: "Spend Willpower to Reroll",
      content: `
        <form class="locus-reroll-dialog">
          <p><strong>Stress:</strong> ${stress}</p>
          <p><strong>Willpower:</strong> ${willpower}</p>
          <p>You may reroll up to <strong>${rerollLimit}</strong> failed die/dice for <strong>1 WP</strong>.</p>
          ${checkboxContent}
        </form>
      `,
      buttons: {
        reroll: {
          label: "Reroll",
          callback: async (dialogHtml) => {
            const selected = dialogHtml
              .find('input[name="rerollDie"]:checked')
              .map((_, el) => Number(el.value))
              .get();

            if (!selected.length) {
              ui.notifications.warn("Select at least one die to reroll.");
              return;
            }

            if (selected.length > rerollLimit) {
              ui.notifications.warn(
                `You may only reroll up to ${rerollLimit} die/dice at your current stress level.`
              );
              return;
            }

            const newDice = [...rollData.diceResults];

            for (const index of selected) {
              const reroll = await new Roll("1d6").evaluate({ async: true });

              if (game.dice3d) {
                await game.dice3d.showForRoll(reroll, game.user, true);
              }

              newDice[index] = reroll.total;
            }

            newDice.sort((a, b) => a - b);

            const newWP = willpower - 1;

            await actor.update({
              "system.resources.willpower.value": newWP
            });

            const consultedDie = getConsultedDie(rollData.difficulty, newDice);
            const critical = isCriticalSuccess(newDice);
            const resultText = getResultText({
              consultedDie,
              attributeValue: rollData.attributeValue,
              critical
            });

            const failedDice = getFailedDiceIndices(
              newDice,
              rollData.attributeValue
            );

            const canReroll = !critical && failedDice.length > 0 && newWP > 0;

            const content = buildRollContent({
              actorName: actor.name,
              attributeLabel: rollData.attributeLabel,
              difficulty: rollData.difficulty,
              diceResults: newDice,
              consultedDie,
              attributeValue: rollData.attributeValue,
              resultText,
              stress,
              willpower: newWP,
              canReroll,
              note: `Spent 1 WP to reroll ${selected.length} die/dice.`
            });

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `${rollData.attributeLabel} Check (Reroll)`,
              content,
              flags: {
                "locus-system": {
                  rollData: {
                    actorId: actor.id,
                    attributeKey: rollData.attributeKey,
                    attributeLabel: rollData.attributeLabel,
                    attributeValue: rollData.attributeValue,
                    difficulty: rollData.difficulty,
                    diceResults: newDice
                  }
                }
              }
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "reroll"
    }).render(true);
  });
});