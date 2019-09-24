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

const { Intent, ValueCategory } = require('../semantic');
const DialogStackFrame = require('./base');

module.exports = class YesNoQuestionStackFrame extends DialogStackFrame {
    constructor(dlg) {
        super(dlg);
    }

    get expecting() {
        return ValueCategory.YesNo;
    }

    async help() {
        await this._dlg.reply(this._dlg._("I need you to confirm the last question first."));
        return true;
    }

    compatible(command) {
        return command instanceof Intent.Yes || command instanceof Intent.No;
    }

    async dispatch(command) {
        this.complete(command.value.value);
    }
};
