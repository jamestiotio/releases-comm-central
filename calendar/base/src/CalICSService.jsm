/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalIcalProperty", "CalICSService"];

const { ICAL, unwrapSetter, unwrapSingle, wrapGetter } = ChromeUtils.import(
  "resource:///modules/calendar/Ical.jsm"
);
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const lazy = {};
ChromeUtils.defineModuleGetter(lazy, "CalDateTime", "resource:///modules/CalDateTime.jsm");
ChromeUtils.defineModuleGetter(lazy, "CalDuration", "resource:///modules/CalDuration.jsm");
ChromeUtils.defineModuleGetter(lazy, "CalTimezone", "resource:///modules/CalTimezone.jsm");

function CalIcalProperty(innerObject) {
  this.innerObject = innerObject || new ICAL.Property();
  this.wrappedJSObject = this;
}

CalIcalProperty.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIIcalProperty"]),
  classID: Components.ID("{423ac3f0-f612-48b3-953f-47f7f8fd705b}"),

  get icalString() {
    return this.innerObject.toICALString() + ICAL.newLineChar;
  },
  get icalProperty() {
    return this.innerObject;
  },
  set icalProperty(val) {
    this.innerObject = val;
  },

  get parent() {
    return this.innerObject.parent;
  },
  toString() {
    return this.innerObject.toICAL();
  },

  get value() {
    // Unescaped value for properties of TEXT, escaped otherwise.
    if (this.innerObject.type == "text") {
      return this.innerObject.getValues().join(",");
    }
    return this.valueAsIcalString;
  },
  set value(val) {
    // Unescaped value for properties of TEXT, escaped otherwise.
    if (this.innerObject.type == "text") {
      this.innerObject.setValue(val);
      return;
    }
    this.valueAsIcalString = val;
  },

  get valueAsIcalString() {
    let propertyStr = this.innerObject.toICALString();
    if (propertyStr.match(/:/g).length == 1) {
      // For property containing only one colon, e.g. `GEO:latitude;longitude`,
      // the left hand side must be the property name, the right hand side must
      // be property value.
      return propertyStr.slice(propertyStr.indexOf(":") + 1);
    }
    // For property containing many or no colons, retrieve the property value
    // according to its type. An example is
    // `ATTENDEE;MEMBER="mailto:foo@example.com": mailto:bar@example.com`
    let type = this.innerObject.type;
    return this.innerObject
      .getValues()
      .map(val => {
        if (type == "text") {
          return ICAL.stringify.value(val, type, ICAL.design.icalendar);
        } else if (typeof val == "number" || typeof val == "string") {
          return val;
        } else if ("toICALString" in val) {
          return val.toICALString();
        }
        return val.toString();
      })
      .join(",");
  },
  set valueAsIcalString(val) {
    let mockLine = this.propertyName + ":" + val;
    let prop = ICAL.Property.fromString(mockLine, ICAL.design.icalendar);

    if (this.innerObject.isMultiValue) {
      this.innerObject.setValues(prop.getValues());
    } else {
      this.innerObject.setValue(prop.getFirstValue());
    }
  },

  get valueAsDatetime() {
    let val = this.innerObject.getFirstValue();
    let isIcalTime =
      val && typeof val == "object" && "icalclass" in val && val.icalclass == "icaltime";
    return isIcalTime ? new lazy.CalDateTime(val) : null;
  },
  set valueAsDatetime(rawval) {
    unwrapSetter(
      ICAL.Time,
      rawval,
      function (val) {
        if (
          val &&
          val.zone &&
          val.zone != ICAL.Timezone.utcTimezone &&
          val.zone != ICAL.Timezone.localTimezone
        ) {
          this.innerObject.setParameter("TZID", val.zone.tzid);
          if (this.parent) {
            let tzref = wrapGetter(lazy.CalTimezone, val.zone);
            this.parent.addTimezoneReference(tzref);
          }
        } else {
          this.innerObject.removeParameter("TZID");
        }
        this.innerObject.setValue(val);
      },
      this
    );
  },

  get propertyName() {
    return this.innerObject.name.toUpperCase();
  },

  getParameter(name) {
    // Unfortunately getting the "VALUE" parameter won't work, since in
    // jCal it has been translated to the value type id.
    if (name == "VALUE") {
      let defaultType = this.innerObject.getDefaultType();
      if (this.innerObject.type != defaultType) {
        // Default type doesn't match object type, so we have a VALUE
        // parameter
        return this.innerObject.type.toUpperCase();
      }
    }

    return this.innerObject.getParameter(name.toLowerCase());
  },
  setParameter(name, value) {
    // Similar problems for setting the value parameter. Calendar code
    // expects setting the value parameter to just change the value type
    // and attempt to use the previous value as the new one. To do this in
    // ICAL.js we need to save the value, reset the type and then try to
    // set the value again.
    if (name == "VALUE") {
      let oldValues;
      let type = this.innerObject.type;
      let designSet = this.innerObject._designSet;

      let wasMultiValue = this.innerObject.isMultiValue;
      if (wasMultiValue) {
        oldValues = this.innerObject.getValues();
      } else {
        let oldValue = this.innerObject.getFirstValue();
        oldValues = oldValue ? [oldValue] : [];
      }

      this.innerObject.resetType(value.toLowerCase());
      try {
        oldValues = oldValues.map(oldValue => {
          let strvalue = ICAL.stringify.value(oldValue.toString(), type, designSet);
          return ICAL.parse._parseValue(strvalue, value, designSet);
        });
      } catch (e) {
        // If there was an error reparsing the value, then just keep it
        // empty.
        oldValues = null;
      }

      if (oldValues && oldValues.length) {
        if (wasMultiValue && this.innerObject.isMultiValue) {
          this.innerObject.setValues(oldValues);
        } else {
          this.innerObject.setValue(oldValues.join(","));
        }
      }
    } else {
      this.innerObject.setParameter(name.toLowerCase(), value);
    }
  },
  removeParameter(name) {
    // Again, VALUE needs special handling. Removing the value parameter is
    // kind of like resetting it to the default type. So find out the
    // default type and then set the value parameter to it.
    if (name == "VALUE") {
      let propname = this.innerObject.name.toLowerCase();
      if (propname in ICAL.design.icalendar.property) {
        let details = ICAL.design.icalendar.property[propname];
        if ("defaultType" in details) {
          this.setParameter("VALUE", details.defaultType);
        }
      }
    } else {
      this.innerObject.removeParameter(name.toLowerCase());
    }
  },

  clearXParameters() {
    cal.WARN(
      "calIICSService::clearXParameters is no longer implemented, please use removeParameter"
    );
  },

  paramIterator: null,
  getFirstParameterName() {
    let innerObject = this.innerObject;
    this.paramIterator = (function* () {
      let defaultType = innerObject.getDefaultType();
      if (defaultType != innerObject.type) {
        yield "VALUE";
      }

      let paramNames = Object.keys(innerObject.jCal[1] || {});
      for (let name of paramNames) {
        yield name.toUpperCase();
      }
    })();
    return this.getNextParameterName();
  },

  getNextParameterName() {
    if (this.paramIterator) {
      let next = this.paramIterator.next();
      if (next.done) {
        this.paramIterator = null;
      }

      return next.value;
    }
    return this.getFirstParameterName();
  },
};

function calIcalComponent(innerObject) {
  this.innerObject = innerObject || new ICAL.Component();
  this.wrappedJSObject = this;
  this.mReferencedZones = {};
}

calIcalComponent.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIIcalComponent"]),
  classID: Components.ID("{51ac96fd-1279-4439-a85b-6947b37f4cea}"),

  clone() {
    return new calIcalComponent(new ICAL.Component(this.innerObject.toJSON()));
  },

  get parent() {
    return wrapGetter(calIcalComponent, this.innerObject.parent);
  },

  get icalTimezone() {
    return this.innerObject.name == "vtimezone" ? this.innerObject : null;
  },
  get icalComponent() {
    return this.innerObject;
  },
  set icalComponent(val) {
    this.innerObject = val;
  },

  componentIterator: null,
  getFirstSubcomponent(kind) {
    if (kind == "ANY") {
      kind = null;
    } else if (kind) {
      kind = kind.toLowerCase();
    }
    let innerObject = this.innerObject;
    this.componentIterator = (function* () {
      let comps = innerObject.getAllSubcomponents(kind);
      if (comps) {
        for (let comp of comps) {
          yield new calIcalComponent(comp);
        }
      }
    })();
    return this.getNextSubcomponent(kind);
  },
  getNextSubcomponent(kind) {
    if (this.componentIterator) {
      let next = this.componentIterator.next();
      if (next.done) {
        this.componentIterator = null;
      }

      return next.value;
    }
    return this.getFirstSubcomponent(kind);
  },

  get componentType() {
    return this.innerObject.name.toUpperCase();
  },

  get uid() {
    return this.innerObject.getFirstPropertyValue("uid");
  },
  set uid(val) {
    this.innerObject.updatePropertyWithValue("uid", val);
  },

  get prodid() {
    return this.innerObject.getFirstPropertyValue("prodid");
  },
  set prodid(val) {
    this.innerObject.updatePropertyWithValue("prodid", val);
  },

  get version() {
    return this.innerObject.getFirstPropertyValue("version");
  },
  set version(val) {
    this.innerObject.updatePropertyWithValue("version", val);
  },

  get method() {
    return this.innerObject.getFirstPropertyValue("method");
  },
  set method(val) {
    this.innerObject.updatePropertyWithValue("method", val);
  },

  get status() {
    return this.innerObject.getFirstPropertyValue("status");
  },
  set status(val) {
    this.innerObject.updatePropertyWithValue("status", val);
  },

  get summary() {
    return this.innerObject.getFirstPropertyValue("summary");
  },
  set summary(val) {
    this.innerObject.updatePropertyWithValue("summary", val);
  },

  get description() {
    return this.innerObject.getFirstPropertyValue("description");
  },
  set description(val) {
    this.innerObject.updatePropertyWithValue("description", val);
  },

  get location() {
    return this.innerObject.getFirstPropertyValue("location");
  },
  set location(val) {
    this.innerObject.updatePropertyWithValue("location", val);
  },

  get categories() {
    return this.innerObject.getFirstPropertyValue("categories");
  },
  set categories(val) {
    this.innerObject.updatePropertyWithValue("categories", val);
  },

  get URL() {
    return this.innerObject.getFirstPropertyValue("url");
  },
  set URL(val) {
    this.innerObject.updatePropertyWithValue("url", val);
  },

  get priority() {
    // If there is no value for this integer property, then we must return
    // the designated INVALID_VALUE.
    const INVALID_VALUE = Ci.calIIcalComponent.INVALID_VALUE;
    let prop = this.innerObject.getFirstProperty("priority");
    let val = prop ? prop.getFirstValue() : null;
    return val === null ? INVALID_VALUE : val;
  },
  set priority(val) {
    this.innerObject.updatePropertyWithValue("priority", val);
  },

  _setTimeAttr(propName, val) {
    let prop = this.innerObject.updatePropertyWithValue(propName, val);
    if (
      val &&
      val.zone &&
      val.zone != ICAL.Timezone.utcTimezone &&
      val.zone != ICAL.Timezone.localTimezone
    ) {
      prop.setParameter("TZID", val.zone.tzid);
      this.addTimezoneReference(wrapGetter(lazy.CalTimezone, val.zone));
    } else {
      prop.removeParameter("TZID");
    }
  },

  get startTime() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("dtstart"));
  },
  set startTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "dtstart"), this);
  },

  get endTime() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("dtend"));
  },
  set endTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "dtend"), this);
  },

  get duration() {
    return wrapGetter(lazy.CalDuration, this.innerObject.getFirstPropertyValue("duration"));
  },

  get dueTime() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("due"));
  },
  set dueTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "due"), this);
  },

  get stampTime() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("dtstamp"));
  },
  set stampTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "dtstamp"), this);
  },

  get createdTime() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("created"));
  },
  set createdTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "created"), this);
  },

  get completedTime() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("completed"));
  },
  set completedTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "completed"), this);
  },

  get lastModified() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("last-modified"));
  },
  set lastModified(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "last-modified"), this);
  },

  get recurrenceId() {
    return wrapGetter(lazy.CalDateTime, this.innerObject.getFirstPropertyValue("recurrence-id"));
  },
  set recurrenceId(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "recurrence-id"), this);
  },

  serializeToICS() {
    return this.innerObject.toString() + ICAL.newLineChar;
  },
  toString() {
    return this.innerObject.toString();
  },

  addSubcomponent(comp) {
    comp.getReferencedTimezones().forEach(this.addTimezoneReference, this);
    let jscomp = unwrapSingle(ICAL.Component, comp);
    this.innerObject.addSubcomponent(jscomp);
  },

  propertyIterator: null,
  getFirstProperty(kind) {
    if (kind == "ANY") {
      kind = null;
    } else if (kind) {
      kind = kind.toLowerCase();
    }
    let innerObject = this.innerObject;
    this.propertyIterator = (function* () {
      let props = innerObject.getAllProperties(kind);
      if (!props) {
        return;
      }
      for (let prop of props) {
        let hell = prop.getValues();
        if (hell.length > 1) {
          // Uh oh, multiple property values. Our code expects each as one
          // property. I hate API incompatibility!
          for (let devil of hell) {
            let thisprop = new ICAL.Property(prop.toJSON(), prop.parent);
            thisprop.removeAllValues();
            thisprop.setValue(devil);
            yield new CalIcalProperty(thisprop);
          }
        } else {
          yield new CalIcalProperty(prop);
        }
      }
    })();

    return this.getNextProperty(kind);
  },

  getNextProperty(kind) {
    if (this.propertyIterator) {
      let next = this.propertyIterator.next();
      if (next.done) {
        this.propertyIterator = null;
      }

      return next.value;
    }
    return this.getFirstProperty(kind);
  },

  _getNextParentVCalendar() {
    let vcalendar = this; // eslint-disable-line consistent-this
    while (vcalendar && vcalendar.componentType != "VCALENDAR") {
      vcalendar = vcalendar.parent;
    }
    return vcalendar || this;
  },

  addProperty(prop) {
    try {
      let datetime = prop.valueAsDatetime;
      if (datetime && datetime.timezone) {
        this._getNextParentVCalendar().addTimezoneReference(datetime.timezone);
      }
    } catch (e) {
      // If there is an issue adding the timezone reference, don't make
      // that break adding the property.
    }

    let jsprop = unwrapSingle(ICAL.Property, prop);
    this.innerObject.addProperty(jsprop);
  },

  addTimezoneReference(timezone) {
    if (timezone) {
      if (!(timezone.tzid in this.mReferencedZones) && this.componentType == "VCALENDAR") {
        let comp = timezone.icalComponent;
        if (comp) {
          this.addSubcomponent(comp);
        }
      }

      this.mReferencedZones[timezone.tzid] = timezone;
    }
  },

  getReferencedTimezones(aCount) {
    return Object.keys(this.mReferencedZones).map(timezone => this.mReferencedZones[timezone]);
  },

  serializeToICSStream() {
    let data = this.innerObject.toString();
    let stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    stream.setUTF8Data(data, data.length);
    return stream;
  },
};

function CalICSService() {
  this.wrappedJSObject = this;
}

CalICSService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIICSService"]),
  classID: Components.ID("{c61cb903-4408-41b3-bc22-da0b27efdfe1}"),

  parseICS(serialized) {
    let comp = ICAL.parse(serialized);
    return new calIcalComponent(new ICAL.Component(comp));
  },

  parseICSAsync(serialized, listener) {
    let worker = new ChromeWorker("resource:///components/calICSService-worker.js");
    worker.onmessage = function (event) {
      let icalComp = new calIcalComponent(new ICAL.Component(event.data));
      listener.onParsingComplete(Cr.OK, icalComp);
    };
    worker.onerror = function (event) {
      cal.ERROR(`Parsing failed; ${event.message}. ICS data:\n${serialized}`);
      listener.onParsingComplete(Cr.NS_ERROR_FAILURE, null);
    };
    worker.postMessage(serialized);
  },

  createIcalComponent(kind) {
    return new calIcalComponent(new ICAL.Component(kind.toLowerCase()));
  },

  createIcalProperty(kind) {
    return new CalIcalProperty(new ICAL.Property(kind.toLowerCase()));
  },

  createIcalPropertyFromString(str) {
    return new CalIcalProperty(ICAL.Property.fromString(str.trim(), ICAL.design.icalendar));
  },
};
