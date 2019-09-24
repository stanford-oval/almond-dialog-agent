// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const DialogStackFrame = require('./base');

/**
  A customizable stack frame, that is compatible with the commands passed in to the constructor.

  @param {ValueCategory} expecting - the current ask_special mode
  @param {String} debugString - the message shown to "debug" commands
  @param {String} helpString - the message shown to "help" commands
  @param {Class<Intent>} ...compatible - intent classes that are compatible with this stack frame.

  This is useful to have custom dialog-handling logic, and to port-over the old code
  based on .expect() to the new world of stack frames.
*/
module.exports = class CustomStackFrame extends DialogStackFrame {
    constructor(dlg, expecting, helpString, ...compatible) {
        super(dlg);
        this._expecting = expecting;
        this._helpString = helpString;
        this._compatible = compatible;
    }

    get expecting() {
        return this._expecting;
    }

    compatible(command) {
        return this._compatible.some((cls) => command instanceof cls);
    }

    async help() {
        await this._dlg.reply(this._helpString);
    }

    async dispatch(intent) {
        this.complete(intent);
    }
};
