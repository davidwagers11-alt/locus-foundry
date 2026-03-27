export class HGDeckManager {
  static async getState() {
    return foundry.utils.deepClone(
      game.settings.get("locus-system", "sharedDeck")
    );
  }

  static async setState(state) {
    return game.settings.set("locus-system", "sharedDeck", state);
  }

  static createStandardDeck(deckIndex = 0) {
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    const values = [
      "A", "2", "3", "4", "5", "6", "7",
      "8", "9", "10", "J", "Q", "K"
    ];

    const cards = [];

    for (const suit of suits) {
      for (const value of values) {
        cards.push({
          id: `${deckIndex}-${suit}-${value}-${foundry.utils.randomID()}`,
          suit,
          value,
          label: `${value} of ${suit}`,
          deckIndex
        });
      }
    }

    return cards;
  }

  static shuffle(array) {
    const cloned = [...array];
    for (let i = cloned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }
    return cloned;
  }

  static getCardRankValue(card) {
    const raw = card?.value ?? card?.rank;
    if (raw === undefined || raw === null) return null;

    const rank = String(raw).toLowerCase();

    if (rank === "ace" || rank === "a") return 1;
    if (rank === "jack" || rank === "j") return 11;
    if (rank === "queen" || rank === "q") return 12;
    if (rank === "king" || rank === "k") return 13;

    const numeric = Number(rank);
    if (!Number.isNaN(numeric)) return numeric;

    return null;
  }

  static resolveCardEffectForActor(actor, card) {
    const hauntSuit = actor.system.identity?.haunt?.suit ?? "";
    const virtueSuit = actor.system.identity?.virtue?.suit ?? "";

    if (!hauntSuit || !virtueSuit || !card?.suit) return "neutral";

    if (hauntSuit !== virtueSuit) {
      if (card.suit === virtueSuit) return "virtue";
      if (card.suit === hauntSuit) return "haunt";
      return "neutral";
    }

    if (card.suit !== hauntSuit) return "neutral";

    const rankValue = this.getCardRankValue(card);
    if (rankValue === null) return "neutral";

    if (rankValue >= 1 && rankValue <= 7) return "virtue";
    if (rankValue >= 8 && rankValue <= 13) return "haunt";

    return "neutral";
  }

  static async initializeSharedDeck(decks = 1) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can initialize the shared deck.");
      return null;
    }

    let drawPile = [];
    for (let i = 0; i < decks; i++) {
      drawPile.push(...this.createStandardDeck(i));
    }

    drawPile = this.shuffle(drawPile);

    const state = {
      initialized: true,
      decks,
      drawPile,
      discardPile: []
    };

    await this.setState(state);
    ui.notifications.info(`Initialized shared deck with ${decks} deck(s).`);
    return state;
  }

  static async reshuffleIfNeeded(state, neededCards = 1) {
    state.drawPile ??= [];
    state.discardPile ??= [];

    if (state.drawPile.length >= neededCards) return false;
    if (state.discardPile.length === 0) return false;

    const reshuffledCards = this.shuffle(state.discardPile);
    state.drawPile.push(...reshuffledCards);
    state.discardPile = [];

    return true;
  }

  static async drawToActor(actor, count = 1) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can draw cards right now.");
      return null;
    }

    if (!actor) {
      ui.notifications.error("No actor provided for draw.");
      return null;
    }

    const state = await this.getState();

    if (!state.initialized) {
      ui.notifications.warn("Shared deck is not initialized.");
      return null;
    }

    state.drawPile ??= [];
    state.discardPile ??= [];

    const reshuffled = await this.reshuffleIfNeeded(state, count);

    // 🔥 NEW: Chat message for reshuffle
    if (reshuffled) {
      await ChatMessage.create({
        content: `<p><em>The discard pile is reshuffled into the deck.</em></p>`
      });
    }

    if (state.drawPile.length === 0) {
      ui.notifications.warn("The draw pile and discard pile are both empty.");
      return null;
    }

    if (state.drawPile.length < count) {
      ui.notifications.info(
        `Only ${state.drawPile.length} card(s) remained available to draw.`
      );
      count = state.drawPile.length;
    }

    const currentHand = foundry.utils.deepClone(
      actor.getFlag("locus-system", "hand") ?? []
    );

    const currentWillpower = actor.system.resources?.willpower?.value ?? 0;

    const drawn = state.drawPile.splice(0, count);

    const result = {
      drawn: [],
      kept: [],
      discarded: [],
      hauntMatches: [],
      virtueMatches: [],
      willpowerGained: 0,
      reshuffled
    };

    for (const card of drawn) {
      const cardData = {
        ...card,
        effect: null
      };

      result.drawn.push(cardData);

      const effect = this.resolveCardEffectForActor(actor, cardData);

      if (effect === "virtue") {
        cardData.effect = "virtue";
        state.discardPile.push(cardData);
        result.discarded.push(cardData);
        result.virtueMatches.push(cardData);
        result.willpowerGained += 3;
        continue;
      }

      if (effect === "haunt") {
        cardData.effect = "haunt";
        result.hauntMatches.push(cardData);
      } else {
        cardData.effect = "neutral";
      }

      currentHand.push(cardData);
      result.kept.push(cardData);
    }

    await actor.setFlag("locus-system", "hand", currentHand);

    if (result.willpowerGained > 0) {
      await actor.update({
        "system.resources.willpower.value": currentWillpower + result.willpowerGained
      });
    }

    await this.setState(state);

    return result;
  }

  static async getActorHand(actor) {
    return foundry.utils.deepClone(
      actor.getFlag("locus-system", "hand") ?? []
    );
  }

  static async clearActorHand(actor) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can clear hands right now.");
      return;
    }

    await actor.setFlag("locus-system", "hand", []);
  }

  static async deckSummary() {
    const state = await this.getState();
    return {
      initialized: state.initialized,
      decks: state.decks,
      drawPile: state.drawPile?.length ?? 0,
      discardPile: state.discardPile?.length ?? 0
    };
  }
}

Hooks.once("init", () => {
  game.locusSystem = game.locusSystem || {};
  game.locusSystem.deck = HGDeckManager;

  console.log("Locus System | Deck manager registered");
});