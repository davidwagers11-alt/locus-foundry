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
}