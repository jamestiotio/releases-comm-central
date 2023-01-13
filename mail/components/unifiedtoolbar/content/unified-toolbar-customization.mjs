/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../base/content/spacesToolbar.js */

import {
  storeState,
  getState,
} from "resource:///modules/CustomizationState.mjs";
import "./unified-toolbar-tab.mjs"; // eslint-disable-line import/no-unassigned-import
import "./unified-toolbar-customization-pane.mjs"; // eslint-disable-line import/no-unassigned-import
import {
  BUTTON_STYLE_MAP,
  BUTTON_STYLE_PREF,
} from "resource:///modules/ButtonStyle.mjs";

/**
 * Customization palette container for the unified toolbar. Contained in a
 * custom element for state management. When visible, the document should have
 * the customizingUnifiedToolbar class.
 * Template: #unifiedToolbarCustomizationTemplate.
 */
class UnifiedToolbarCustomization extends HTMLElement {
  /**
   * Reference to the container where the space tabs go in. The tab panels will
   * be placed after this element.
   *
   * @type {?HTMLDivElement}
   */
  #tabList = null;

  #buttonStyle = null;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("unifiedToolbarCustomizationTemplate")
      .content.cloneNode(true);
    const form = template.querySelector("form");
    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        this.#save();
        this.toggle(false);
      },
      {
        passive: false,
      }
    );
    form.addEventListener("reset", event => {
      this.#reset();
    });
    template
      .querySelector("#unifiedToolbarCustomizationCancel")
      .addEventListener("click", () => {
        this.toggle(false);
      });
    this.#buttonStyle = template.querySelector("#buttonStyle");
    this.#buttonStyle.addEventListener(
      "command",
      this.#handleButtonStyleChange
    );
    this.addEventListener("itemchange", this.#handleItemChange, {
      capture: true,
    });
    this.#tabList = template.querySelector("#customizationTabs");
    this.#tabList.addEventListener("tabswitch", this.#handleTabSwitch, {
      capture: true,
    });
    template
      .querySelector("#customizationToSettingsButton")
      .addEventListener("click", this.#handleSettingsButton);
    this.initialize();
    this.append(template);
    this.#updateResetToDefault();
  }

  #handleItemChange = event => {
    event.stopPropagation();
    this.#updateResetToDefault();
    this.#updateUnsavedChangesState();
  };

  #handleTabSwitch = event => {
    event.stopPropagation();
    this.#updateUnsavedChangesState();
  };

  #handleButtonStyleChange = event => {
    Services.prefs.setIntPref(
      BUTTON_STYLE_PREF,
      BUTTON_STYLE_MAP.indexOf(event.target.value)
    );
  };

  #handleSettingsButton = event => {
    event.preventDefault();
    openPreferencesTab("paneGeneral", "layoutGroup");
    this.toggle(false);
  };

  /**
   * Update state of reset to default button.
   */
  #updateResetToDefault() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const isDefault = tabPanes.every(pane => pane.matchesDefaultState);
    this.querySelector('button[type="reset"]').disabled = isDefault;
  }

  #updateUnsavedChangesState() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const unsavedChanges = tabPanes.some(tabPane => tabPane.hasChanges);
    const otherSpacesHaveUnsavedChanges =
      unsavedChanges &&
      tabPanes.some(tabPane => tabPane.hidden && tabPane.hasChanges);
    this.querySelector('button[type="submit"]').disabled = !unsavedChanges;
    document.getElementById(
      "unifiedToolbarCustomizationUnsavedChanges"
    ).hidden = !otherSpacesHaveUnsavedChanges;
  }

  /**
   * Generate a tab and tab pane that are linked together for the given space.
   * If the space is the current space, the tab is marked as active.
   *
   * @param {SpaceInfo} space
   * @returns {{tab: UnifiedToolbarTab, tabPane: UnifiedToolbarCustomizationPane}}
   */
  #makeSpaceTab(space) {
    const activeSpace = space === gSpacesToolbar.currentSpace;
    const tabId = `unified-toolbar-customization-tab-${space.name}`;
    const paneId = `unified-toolbar-customization-pane-${space.name}`;
    const tab = document.createElement("unified-toolbar-tab");
    tab.id = tabId;
    tab.setAttribute("aria-controls", paneId);
    if (activeSpace) {
      tab.setAttribute("selected", true);
    }
    //TODO names of extension spaces won't work like this.
    document.l10n.setAttributes(tab, `customize-space-${space.name}`);
    const tabPane = document.createElement(
      "unified-toolbar-customization-pane"
    );
    tabPane.id = paneId;
    tabPane.setAttribute("space", space.name);
    tabPane.setAttribute("aria-labelledby", tabId);
    tabPane.hidden = !activeSpace;
    return { tab, tabPane };
  }

  /**
   * Reset all the spaces to their default customization state.
   */
  #reset() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    for (const pane of tabPanes) {
      pane.reset();
    }
  }

  #save() {
    const tabPanes = Array.from(
      this.querySelectorAll("unified-toolbar-customization-pane")
    );
    const state = Object.fromEntries(
      tabPanes
        .filter(pane => !pane.matchesDefaultState)
        .map(pane => [pane.getAttribute("space"), pane.itemIds])
    );
    storeState(state);
  }

  /**
   * Initialize the contents of this from the current state. Specifically makes
   * sure all the spaces have a tab, and all tabs still have a space.
   *
   * @param {boolean} [deep = false] - If true calls initialize on all tab
   *   panes.
   */
  initialize(deep = false) {
    const state = getState();
    const existingTabs = Array.from(this.#tabList.children);
    const tabSpaces = existingTabs.map(tab => tab.id.split("-").pop());
    const spaceNames = new Set(gSpacesToolbar.spaces.map(space => space.name));
    const removedTabs = existingTabs.filter(
      (tab, index) => !spaceNames.has(tabSpaces[index])
    );
    for (const tab of removedTabs) {
      tab.pane.remove();
      tab.remove();
    }
    const newTabs = gSpacesToolbar.spaces.map(space => {
      if (tabSpaces.includes(space.name)) {
        const tab = existingTabs[tabSpaces.indexOf(space.name)];
        return [tab, tab.pane];
      }
      const { tab, tabPane } = this.#makeSpaceTab(space);
      return [tab, tabPane];
    });
    this.#tabList.replaceChildren(...newTabs.map(([tab]) => tab));
    let previousNode = this.#tabList;
    for (const [, tabPane] of newTabs) {
      previousNode.after(tabPane);
      const space = tabPane.getAttribute("space");
      if (state.hasOwnProperty(space)) {
        tabPane.setAttribute("current-items", state[space].join(","));
      }
      previousNode = tabPane;
      if (deep) {
        tabPane.initialize(deep);
      }
    }
    this.#buttonStyle.value =
      BUTTON_STYLE_MAP[Services.prefs.getIntPref(BUTTON_STYLE_PREF, 0)];
    // Update state of reset to default button only when updating tab panes too.
    if (deep) {
      this.#updateResetToDefault();
      this.#updateUnsavedChangesState();
    }
  }

  /**
   * Toggle unified toolbar customization.
   *
   * @param {boolean} [visible] - If passed, defines if customization should
   *   be active.
   */
  toggle(visible) {
    if (visible && gSpacesToolbar.currentSpace) {
      this.initialize(true);
      document
        .getElementById(
          `unified-toolbar-customization-tab-${gSpacesToolbar.currentSpace.name}`
        )
        ?.select();
    }

    document.documentElement.classList.toggle(
      "customizingUnifiedToolbar",
      visible
    );
  }
}
customElements.define(
  "unified-toolbar-customization",
  UnifiedToolbarCustomization
);
