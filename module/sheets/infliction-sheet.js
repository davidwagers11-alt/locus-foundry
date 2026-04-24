<<<<<<< HEAD
export class LocusInflictionSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "item", "infliction"],
      template: "systems/locus-system/templates/item/infliction-sheet.html",
      width: 620,
      height: 620,
      resizable: true
    });
  }

  get title() {
    return `${this.item.name} — Infliction`;
  }

  getData(options = {}) {
    const context = super.getData(options);
    context.system = this.item.system;
    context.isInfliction = this.item.type === "infliction";
    context.difficulties = ["easy", "medium", "hard"];
    context.attributes = [
      "frailty",
      "clumsiness",
      "carelessness",
      "impatience",
      "cowardice",
      "ignorance",
      "repulsion",
      "temper"
    ];
    return context;
  }
=======
export class LocusInflictionSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "item", "infliction"],
      template: "systems/locus-system/templates/item/infliction-sheet.html",
      width: 620,
      height: 620,
      resizable: true
    });
  }

  get title() {
    return `${this.item.name} — Infliction`;
  }

  getData(options = {}) {
    const context = super.getData(options);
    context.system = this.item.system;
    context.isInfliction = this.item.type === "infliction";
    context.difficulties = ["easy", "medium", "hard"];
    context.attributes = [
      "frailty",
      "clumsiness",
      "carelessness",
      "impatience",
      "cowardice",
      "ignorance",
      "repulsion",
      "temper"
    ];
    return context;
  }
>>>>>>> 60a8c33e340506e04a93be96f090995ec22a958d
}