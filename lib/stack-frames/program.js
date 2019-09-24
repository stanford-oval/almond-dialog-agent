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

const ruleDialog = require('../dialogs/rule');

const DialogStackFrame = require('./base');

module.exports = class ProgramStackFrame extends DialogStackFrame {
    constructor(dlg, uniqueId, sourceIdentity) {
        super(dlg);
        this._uniqueId = uniqueId;
        this._sourceIdentity = sourceIdentity;
    }

    compatible(command) {
        // FIXME all programs with the same functions are compatible with this stack frame
        return false;
    }

    async dispatch(intent) {
        this._dlg.manager.stats.hit('sabrina-command-rule');
        await ruleDialog(this._dlg, intent, intent.confident, this._uniqueId, this._sourceIdentity);
        this.complete();
    }
};
