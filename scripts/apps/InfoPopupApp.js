import { MODULE_ID } from '../constants.js';
import { getEntityInfo, setEntityInfo } from '../data.js';

export class InfoPopupApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "fame-info-popup",
    classes: ["fame-info-popup"],
    position: { width: 550, height: 520 },
    window: { icon: "fa-solid fa-circle-info", resizable: false },
    form: {
      handler: InfoPopupApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/info-popup.hbs`
    }
  };

  constructor(entityType, entityId, entityName, options = {}) {
    super(options);
    this.entityType = entityType;
    this.entityId = entityId;
    this.entityName = entityName;
  }

  get title() {
    return `${game.i18n.localize(`${MODULE_ID}.info.title`)} - ${this.entityName}`;
  }

  async _prepareContext() {
    const info = getEntityInfo(this.entityType, this.entityId);
    const isGM = game.user.isGM;
    const enrichedPublic = await TextEditor.enrichHTML(info.public || '', { async: true });

    return {
      info,
      enrichedPublic,
      isGM,
      publicLabel: game.i18n.localize(`${MODULE_ID}.info.tab-public`),
      gmLabel: game.i18n.localize(`${MODULE_ID}.info.tab-gm`),
      noInfo: game.i18n.localize(`${MODULE_ID}.info.no-info`),
      saveLabel: game.i18n.localize("Save"),
      entityType: this.entityType,
      entityId: this.entityId
    };
  }

  _onRender(context, options) {
    const html = this.element;

    html.querySelector('.fame-save-btn')?.addEventListener('click', e => {
      e.preventDefault();
      this.#saveAndClose();
    });
  }

  async #saveAndClose() {
    const html = this.element;
    const info = getEntityInfo(this.entityType, this.entityId);

    const publicEditor = html.querySelector('.fame-editor[data-field="public"] .ProseMirror');
    const gmEditor = html.querySelector('.fame-editor[data-field="gm"] .ProseMirror');

    if (publicEditor) {
      info.public = publicEditor.innerHTML;
    }
    if (gmEditor) {
      info.gm = gmEditor.innerHTML;
    }

    const publicInput = html.querySelector('input[name="public"]');
    const gmInput = html.querySelector('input[name="gm"]');

    if (publicInput) info.public = publicInput.value;
    if (gmInput) info.gm = gmInput.value;

    await setEntityInfo(this.entityType, this.entityId, info);
    this.close();
  }

  static async #onSubmit(event, form, formData) {
    const info = getEntityInfo(this.entityType, this.entityId);

    if (formData.object.public !== undefined) {
      info.public = formData.object.public;
    }
    if (formData.object.gm !== undefined) {
      info.gm = formData.object.gm;
    }

    await setEntityInfo(this.entityType, this.entityId, info);
  }

  static open(entityType, entityId, entityName) {
    new InfoPopupApp(entityType, entityId, entityName).render(true);
  }
}