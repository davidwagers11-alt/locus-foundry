<<<<<<< HEAD
export class LocusItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "item"],
      template: "systems/locus-system/templates/item/item-sheet.html",
      width: 560,
      height: 520,
      resizable: true
    });
  }

  get title() {
    return `${this.item.name} — Item`;
  }

  getData(options = {}) {
    const context = super.getData(options);
    context.system = this.item.system;
    context.isGenericItem = this.item.type === "item";
    return context;
  }
=======
export class LocusItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["locus-system", "sheet", "item"],
      template: "systems/locus-system/templates/item/item-sheet.html",
      width: 560,
      height: 520,
      resizable: true
    });
  }

  get title() {
    return `${this.item.name} — Item`;
  }

  getData(options = {}) {
    const context = super.getData(options);
    context.system = this.item.system;
    context.isGenericItem = this.item.type === "item";
    return context;
  }
>>>>>>> 60a8c33e340506e04a93be96f090995ec22a958d
}