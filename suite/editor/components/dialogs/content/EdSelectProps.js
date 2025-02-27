/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../composer/content/editorUtilities.js */
/* import-globals-from EdDialogCommon.js */

// Global variables

var hasValue;
var oldValue;
var insertNew;
var itemArray;
var theTree;
var treeSelection;
var selectElement;
var currentItem = null;
var selectedOption = null;
var selectedOptionCount = 0;

document.addEventListener("dialogaccept", onAccept);
document.addEventListener("dialogcancel", onCancel);

// Utility functions

function getParentIndex(index) {
  switch (itemArray[index].level) {
    case 0:
      return -1;
    case 1:
      return 0;
  }
  // eslint-disable-next-line curly
  while (itemArray[--index].level > 1);
  return index;
}

function UpdateSelectMultiple() {
  if (selectedOptionCount > 1) {
    gDialog.selectMultiple.checked = true;
    gDialog.selectMultiple.disabled = true;
  } else {
    gDialog.selectMultiple.disabled = false;
  }
}

/* wrapper objects:
 * readonly attribute Node element; // DOM node (select/optgroup/option)
 * readonly attribute int level; // tree depth
 * readonly attribute boolean container; // can contain options
 * string getCellText(string col); // tree view helper
 * string cycleCell(int currentIndex); // tree view helper
 * void onFocus(); // load data into deck
 * void onBlur(); // save data from deck
 * boolean canDestroy(boolean prompt); // NB prompt not used
 * void destroy(); // post remove callback
 * void moveUp();
 * boolean canMoveDown();
 * void moveDown();
 * void appendOption(newElement, currentIndex);
 */

// OPTION element wrapper object

// Create a wrapper for the given element at the given level
function optionObject(option, level) {
  // select an added option (when loading from document)
  if (option.hasAttribute("selected")) {
    selectedOptionCount++;
  }
  this.level = level;
  this.element = option;
}

optionObject.prototype.container = false;

optionObject.prototype.getCellText = function(column) {
  if (column.id == "SelectSelCol") {
    return "";
  }
  if (column.id == "SelectValCol" && this.element.hasAttribute("value")) {
    return this.element.getAttribute("value");
  }
  return this.element.text;
};

optionObject.prototype.cycleCell = function(index) {
  if (this.element.hasAttribute("selected")) {
    this.element.removeAttribute("selected");
    selectedOptionCount--;
    selectedOption = null;
  } else {
    // Different handling for multiselect lists
    if (gDialog.selectMultiple.checked || !selectedOption) {
      selectedOptionCount++;
    } else if (selectedOption) {
      selectedOption.removeAttribute("selected");
      let column = theTree.columns.SelectSelCol;
      theTree.invalidateColumn(column);
      selectedOption = null;
    }
    this.element.setAttribute("selected", "");
    selectedOption = this.element;
    let column = theTree.columns.SelectSelCol;
    theTree.invalidateCell(index, column);
  }
  if (currentItem == this) {
    // Also update the deck
    gDialog.optionSelected.setAttribute(
      "checked",
      this.element.hasAttribute("selected")
    );
  }
  UpdateSelectMultiple();
};

optionObject.prototype.onFocus = function() {
  gDialog.optionText.value = this.element.text;
  hasValue = this.element.hasAttribute("value");
  oldValue = this.element.value;
  gDialog.optionHasValue.checked = hasValue;
  gDialog.optionValue.value = hasValue ? this.element.value : this.element.text;
  gDialog.optionSelected.checked = this.element.hasAttribute("selected");
  gDialog.optionDisabled.checked = this.element.hasAttribute("disabled");
  gDialog.selectDeck.setAttribute("selectedIndex", "2");
};

optionObject.prototype.onBlur = function() {
  this.element.text = gDialog.optionText.value;
  if (gDialog.optionHasValue.checked) {
    this.element.value = gDialog.optionValue.value;
  } else {
    this.element.removeAttribute("value");
  }
  if (gDialog.optionSelected.checked) {
    this.element.setAttribute("selected", "");
  } else {
    this.element.removeAttribute("selected");
  }
  if (gDialog.optionDisabled.checked) {
    this.element.setAttribute("disabled", "");
  } else {
    this.element.removeAttribute("disabled");
  }
};

optionObject.prototype.canDestroy = function(prompt) {
  return true;
  /* return !prompt ||
    ConfirmWithTitle(GetString("DeleteOption"),
                     GetString("DeleteOptionMsg"),
                     GetString("DeleteOption"));*/
};

optionObject.prototype.destroy = function() {
  // Deselect a removed option
  if (this.element.hasAttribute("selected")) {
    selectedOptionCount--;
    selectedOption = null;
    UpdateSelectMultiple();
  }
};

/* 4 cases:
 * a) optgroup -> optgroup
 *      ...         ...
 *    option        option
 * b) optgroup -> option
 *      option    optgroup
 *      ...         ...
 * c) option
 *    option
 * d)   option
 *      option
 */

optionObject.prototype.moveUp = function() {
  var index = treeSelection.currentIndex;
  if (
    itemArray[index].level <
    itemArray[index - 1].level + itemArray[index - 1].container
  ) {
    // we need to repaint the tree's lines
    theTree.invalidateRange(getParentIndex(index), index);
    // a) option is just after an optgroup, so it becomes the last child
    itemArray[index].level = 2;
    theTree.view.selectionChanged();
  } else {
    // otherwise new option level is now the same as the previous item
    itemArray[index].level = itemArray[index - 1].level;
    // swap the option with the previous item
    itemArray.splice(index, 0, itemArray.splice(--index, 1)[0]);
  }
  selectTreeIndex(index, true);
};

optionObject.prototype.canMoveDown = function() {
  // move down is not allowed on the last option if its level is 1
  return this.level > 1 || itemArray.length - treeSelection.currentIndex > 1;
};

optionObject.prototype.moveDown = function() {
  var index = treeSelection.currentIndex;
  if (
    index + 1 == itemArray.length ||
    itemArray[index].level > itemArray[index + 1].level
  ) {
    // we need to repaint the tree's lines
    theTree.invalidateRange(getParentIndex(index), index);
    // a) option is last child of an optgroup, so it moves just after
    itemArray[index].level = 1;
    theTree.view.selectionChanged();
  } else {
    // level increases if the option was preceding an optgroup
    itemArray[index].level += itemArray[index + 1].container;
    // swap the option with the next item
    itemArray.splice(index, 0, itemArray.splice(++index, 1)[0]);
  }
  selectTreeIndex(index, true);
};

optionObject.prototype.appendOption = function(child, parent) {
  // special case quick check
  if (this.level == 1) {
    return gDialog.appendOption(child, 0);
  }

  // append the option to the parent element
  parent = getParentIndex(parent);
  return itemArray[parent].appendOption(child, parent);
};

// OPTGROUP element wrapper object

function optgroupObject(optgroup) {
  this.element = optgroup;
}

optgroupObject.prototype.level = 1;

optgroupObject.prototype.container = true;

optgroupObject.prototype.getCellText = function(column) {
  return column.id == "SelectTextCol" ? this.element.label : "";
};

optgroupObject.prototype.cycleCell = function(index) {};

optgroupObject.prototype.onFocus = function() {
  gDialog.optgroupLabel.value = this.element.label;
  gDialog.optgroupDisabled.checked = this.element.disabled;
  gDialog.selectDeck.setAttribute("selectedIndex", "1");
};

optgroupObject.prototype.onBlur = function() {
  this.element.label = gDialog.optgroupLabel.value;
  this.element.disabled = gDialog.optgroupDisabled.checked;
};

optgroupObject.prototype.canDestroy = function(prompt) {
  // Only removing empty option groups for now
  return (
    gDialog.nextChild(treeSelection.currentIndex) -
      treeSelection.currentIndex ==
    1
  );
  /* && (!prompt ||
    ConfirmWithTitle(GetString("DeleteOptGroup"),
                     GetString("DeleteOptGroupMsg"),
                     GetString("DeleteOptGroup")));
*/
};

optgroupObject.prototype.destroy = function() {};

optgroupObject.prototype.moveUp = function() {
  // Find the index of the previous and next elements at the same level
  var index = treeSelection.currentIndex;
  var i = index;
  // eslint-disable-next-line curly
  while (itemArray[--index].level > 1);
  var j = gDialog.nextChild(i);
  // Cut out the element, cut the array in two, then join together
  var movedItems = itemArray.splice(i, j - i);
  var endItems = itemArray.splice(index);
  itemArray = itemArray.concat(movedItems).concat(endItems);
  // Repaint the lot
  theTree.invalidateRange(index, j);
  selectTreeIndex(index, true);
};

optgroupObject.prototype.canMoveDown = function() {
  return gDialog.lastChild() > treeSelection.currentIndex;
};

optgroupObject.prototype.moveDown = function() {
  // Find the index of the next two elements at the same level
  var index = treeSelection.currentIndex;
  var i = gDialog.nextChild(index);
  var j = gDialog.nextChild(i);
  // Cut out the element, cut the array in two, then join together
  var movedItems = itemArray.splice(i, j - 1);
  var endItems = itemArray.splice(index);
  itemArray = itemArray.concat(movedItems).concat(endItems);
  // Repaint the lot
  theTree.invalidateRange(index, j);
  index += j - i;
  selectTreeIndex(index, true);
};

optgroupObject.prototype.appendOption = function(child, parent) {
  var index = gDialog.nextChild(parent);
  // XXX need to repaint the lines, tree won't do this
  var primaryCol = theTree.columns.getPrimaryColumn();
  theTree.invalidateCell(index - 1, primaryCol);
  // insert the wrapped object as the last child
  itemArray.splice(index, 0, new optionObject(child, 2));
  theTree.rowCountChanged(index, 1);
  selectTreeIndex(index, false);
};

// dialog initialization code

function Startup() {
  var editor = GetCurrentEditor();
  if (!editor) {
    dump("Failed to get active editor!\n");
    window.close();
    return;
  }

  // Get a single selected select element
  const kTagName = "select";
  try {
    selectElement = editor.getSelectedElement(kTagName);
  } catch (e) {}

  if (selectElement) {
    // We found an element and don't need to insert one
    insertNew = false;
  } else {
    insertNew = true;

    // We don't have an element selected,
    //  so create one with default attributes
    try {
      selectElement = editor.createElementWithDefaults(kTagName);
    } catch (e) {}

    if (!selectElement) {
      dump("Failed to get selected element or create a new one!\n");
      window.close();
      return;
    }
  }

  // SELECT element wrapper object
  gDialog = {
    // useful elements
    accept: document.documentElement.getButton("accept"),
    selectDeck: document.getElementById("SelectDeck"),
    selectName: document.getElementById("SelectName"),
    selectSize: document.getElementById("SelectSize"),
    selectMultiple: document.getElementById("SelectMultiple"),
    selectDisabled: document.getElementById("SelectDisabled"),
    selectTabIndex: document.getElementById("SelectTabIndex"),
    optgroupLabel: document.getElementById("OptGroupLabel"),
    optgroupDisabled: document.getElementById("OptGroupDisabled"),
    optionText: document.getElementById("OptionText"),
    optionHasValue: document.getElementById("OptionHasValue"),
    optionValue: document.getElementById("OptionValue"),
    optionSelected: document.getElementById("OptionSelected"),
    optionDisabled: document.getElementById("OptionDisabled"),
    removeButton: document.getElementById("RemoveButton"),
    previousButton: document.getElementById("PreviousButton"),
    nextButton: document.getElementById("NextButton"),
    tree: document.getElementById("SelectTree"),
    // wrapper methods (except MoveUp and MoveDown)
    element: selectElement.cloneNode(false),
    level: 0,
    container: true,
    getCellText(column) {
      return column.id == "SelectTextCol"
        ? this.element.getAttribute("name")
        : "";
    },
    cycleCell(index) {},
    onFocus() {
      gDialog.selectName.value = this.element.getAttribute("name");
      gDialog.selectSize.value = this.element.getAttribute("size");
      gDialog.selectMultiple.checked = this.element.hasAttribute("multiple");
      gDialog.selectDisabled.checked = this.element.hasAttribute("disabled");
      gDialog.selectTabIndex.value = this.element.getAttribute("tabindex");
      this.selectDeck.setAttribute("selectedIndex", "0");
      onNameInput();
    },
    onBlur() {
      this.element.setAttribute("name", gDialog.selectName.value);
      if (gDialog.selectSize.value) {
        this.element.setAttribute("size", gDialog.selectSize.value);
      } else {
        this.element.removeAttribute("size");
      }
      if (gDialog.selectMultiple.checked) {
        this.element.setAttribute("multiple", "");
      } else {
        this.element.removeAttribute("multiple");
      }
      if (gDialog.selectDisabled.checked) {
        this.element.setAttribute("disabled", "");
      } else {
        this.element.removeAttribute("disabled");
      }
      if (gDialog.selectTabIndex.value) {
        this.element.setAttribute("tabindex", gDialog.selectTabIndex.value);
      } else {
        this.element.removeAttribute("tabindex");
      }
    },
    appendOption(child, parent) {
      var index = itemArray.length;
      // XXX need to repaint the lines, tree won't do this
      theTree.invalidateRange(this.lastChild(), index);
      // append the wrapped object
      itemArray.push(new optionObject(child, 1));
      theTree.rowCountChanged(index, 1);
      selectTreeIndex(index, false);
    },
    canDestroy(prompt) {
      return false;
    },
    canMoveDown() {
      return false;
    },
    // helper methods
    // Find the index of the next immediate child of the select
    nextChild(index) {
      // eslint-disable-next-line curly
      while (++index < itemArray.length && itemArray[index].level > 1);
      return index;
    },
    // Find the index of the last immediate child of the select
    lastChild() {
      var index = itemArray.length;
      // eslint-disable-next-line curly
      while (itemArray[--index].level > 1);
      return index;
    },
  };
  // Start with the <select> wrapper
  itemArray = [gDialog];

  // We modify the actual option and optgroup elements so clone them first
  for (var child = selectElement.firstChild; child; child = child.nextSibling) {
    if (child.tagName == "OPTION") {
      itemArray.push(new optionObject(child.cloneNode(true), 1));
    } else if (child.tagName == "OPTGROUP") {
      itemArray.push(new optgroupObject(child.cloneNode(false)));
      for (
        var grandchild = child.firstChild;
        grandchild;
        grandchild = grandchild.nextSibling
      ) {
        if (grandchild.tagName == "OPTION") {
          itemArray.push(new optionObject(grandchild.cloneNode(true), 2));
        }
      }
    }
  }

  UpdateSelectMultiple();

  // Define a custom view for the tree
  theTree = gDialog.tree;
  theTree.view = {
    QueryInterface: ChromeUtils.generateQI([
      "nsITreeView",
      "nsISupportsWeakReference",
    ]),
    // useful for debugging
    get wrappedJSObject() {
      return this;
    },
    get rowCount() {
      return itemArray.length;
    },
    get selection() {
      return treeSelection;
    },
    set selection(selection) {
      return (treeSelection = selection);
    },
    getRowProperties(index) {
      return "";
    },
    // could have used a wrapper for this
    getCellProperties(index, column) {
      if (column.id == "SelectSelCol" && !itemArray[index].container) {
        return "checked-" + itemArray[index].element.hasAttribute("selected");
      }
      return "";
    },
    getColumnProperties(column) {
      return "";
    },
    // get info from wrapper
    isContainer(index) {
      return itemArray[index].container;
    },
    isContainerOpen(index) {
      return true;
    },
    isContainerEmpty(index) {
      return true;
    },
    isSeparator(index) {
      return false;
    },
    isSorted() {
      return false;
    },
    // d&d not implemented yet!
    canDrop(index, orientation) {
      return false;
    },
    drop(index, orientation) {
      alert("drop:" + index + "," + orientation);
    },
    // same as the global helper
    getParentIndex,
    // tree needs to know when to paint lines
    hasNextSibling(index, after) {
      if (!index) {
        return false;
      }
      var level = itemArray[index].level;
      while (++after < itemArray.length) {
        switch (level - itemArray[after].level) {
          case 1:
            return false;
          case 0:
            return true;
        }
      }
      return false;
    },
    getLevel(index) {
      return itemArray[index].level;
    },
    getImageSrc(index, column) {},
    getProgressMode(index, column) {},
    getCellValue(index, column) {},
    getCellText(index, column) {
      return itemArray[index].getCellText(column);
    },
    setTree(tree) {
      this.tree = tree;
    },
    toggleOpenState(index) {},
    cycleHeader(col) {},
    selectionChanged() {
      // Save current values and update buttons and deck
      if (currentItem) {
        currentItem.onBlur();
      }
      var currentIndex = treeSelection.currentIndex;
      currentItem = itemArray[currentIndex];
      gDialog.removeButton.disabled = !currentItem.canDestroy();
      gDialog.previousButton.disabled = currentIndex < 2;
      gDialog.nextButton.disabled = !currentItem.canMoveDown();
      // For Advanced Edit
      globalElement = currentItem.element;
      currentItem.onFocus();
    },
    cycleCell(index, column) {
      itemArray[index].cycleCell(index);
    },
    isEditable(index, column) {
      return false;
    },
  };
  treeSelection.select(0);
  currentItem = gDialog;
  // onNameInput();

  SetTextboxFocus(gDialog.selectName);

  SetWindowLocation();
}

// Called from Advanced Edit
function InitDialog() {
  currentItem.onFocus();
}

// Called from Advanced Edit
function ValidateData() {
  currentItem.onBlur();
  return true;
}

function onAccept() {
  // All values are valid - copy to actual element in doc or
  //   element created to insert
  ValidateData();

  var editor = GetCurrentEditor();

  // Coalesce into one undo transaction
  editor.beginTransaction();

  try {
    editor.cloneAttributes(selectElement, gDialog.element);

    if (insertNew) {
      // 'true' means delete the selection before inserting
      editor.insertElementAtSelection(selectElement, true);
    }

    editor.setShouldTxnSetSelection(false);

    while (selectElement.lastChild) {
      editor.deleteNode(selectElement.lastChild);
    }

    var offset = 0;
    for (var i = 1; i < itemArray.length; i++) {
      if (itemArray[i].level > 1) {
        selectElement.lastChild.appendChild(itemArray[i].element);
      } else {
        editor.insertNode(itemArray[i].element, selectElement, offset++);
      }
    }

    editor.setShouldTxnSetSelection(true);
  } finally {
    editor.endTransaction();
  }

  SaveWindowLocation();
}

// Button actions
function AddOption() {
  currentItem.appendOption(
    GetCurrentEditor().createElementWithDefaults("option"),
    treeSelection.currentIndex
  );
  SetTextboxFocus(gDialog.optionText);
}

function AddOptGroup() {
  var optgroupElement = GetCurrentEditor().createElementWithDefaults(
    "optgroup"
  );
  var index = itemArray.length;
  // XXX need to repaint the lines, tree won't do this
  theTree.invalidateRange(gDialog.lastChild(), index);
  // append the wrapped object
  itemArray.push(new optgroupObject(optgroupElement));
  theTree.rowCountChanged(index, 1);
  selectTreeIndex(index, false);
  SetTextboxFocus(gDialog.optgroupLabel);
}

function RemoveElement() {
  if (currentItem.canDestroy(true)) {
    // Only removing empty option groups for now
    var index = treeSelection.currentIndex;
    var level = itemArray[index].level;
    // Perform necessary cleanup and remove the wrapper
    itemArray[index].destroy();
    itemArray.splice(index, 1);
    --index;
    // XXX need to repaint the lines, tree won't do this
    if (level == 1) {
      var last = gDialog.lastChild();
      if (index > last) {
        theTree.invalidateRange(last, index);
      }
    }
    selectTreeIndex(index, true);
    theTree.rowCountChanged(++index, -1);
  }
}

// Event handler
function onTreeKeyUp(event) {
  if (event.keyCode == event.DOM_VK_SPACE) {
    currentItem.cycleCell();
  }
}

function onNameInput() {
  var disabled = !gDialog.selectName.value;
  if (gDialog.accept.disabled != disabled) {
    gDialog.accept.disabled = disabled;
  }
  gDialog.element.setAttribute("name", gDialog.selectName.value);
  // repaint the tree
  var primaryCol = theTree.columns.getPrimaryColumn();
  theTree.invalidateCell(treeSelection.currentIndex, primaryCol);
}

function onLabelInput() {
  currentItem.element.setAttribute("label", gDialog.optgroupLabel.value);
  // repaint the tree
  var primaryCol = theTree.columns.getPrimaryColumn();
  theTree.invalidateCell(treeSelection.currentIndex, primaryCol);
}

function onTextInput() {
  currentItem.element.text = gDialog.optionText.value;
  // repaint the tree
  if (hasValue) {
    var primaryCol = theTree.columns.getPrimaryColumn();
    theTree.invalidateCell(treeSelection.currentIndex, primaryCol);
  } else {
    gDialog.optionValue.value = gDialog.optionText.value;
    theTree.invalidateRow(treeSelection.currentIndex);
  }
}

function onValueInput() {
  gDialog.optionHasValue.checked = hasValue = true;
  oldValue = gDialog.optionValue.value;
  currentItem.element.setAttribute("value", oldValue);
  // repaint the tree
  var column = theTree.columns.SelectValCol;
  theTree.invalidateCell(treeSelection.currentIndex, column);
}

function onHasValueClick() {
  hasValue = gDialog.optionHasValue.checked;
  if (hasValue) {
    gDialog.optionValue.value = oldValue;
    currentItem.element.setAttribute("value", oldValue);
  } else {
    oldValue = gDialog.optionValue.value;
    gDialog.optionValue.value = gDialog.optionText.value;
    currentItem.element.removeAttribute("value");
  }
  // repaint the tree
  var column = theTree.columns.SelectValCol;
  theTree.invalidateCell(treeSelection.currentIndex, column);
}

function onSelectMultipleClick() {
  // Recalculate the unique selected option if we need it and have lost it
  if (
    !gDialog.selectMultiple.checked &&
    selectedOptionCount == 1 &&
    !selectedOption
  ) {
    // eslint-disable-next-line curly
    for (
      var i = 1;
      !(selectedOption = itemArray[i].element).hasAttribute("selected");
      i++
    );
  }
}

function selectTreeIndex(index, focus) {
  treeSelection.select(index);
  theTree.ensureRowIsVisible(index);
  if (focus) {
    gDialog.tree.focus();
  }
}
