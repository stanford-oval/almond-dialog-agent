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

module.exports = class TopLevelStackFrame extends DialogStackFrame {
    get expecting() {
        // at the top-level we don't expect anything (the interaction is complete)
        return null;
    }

    async debug() {
        await this._dlg.reply("I'm in the default state");
        await this._dlg.reply("I'm not expecting anything");
    }

    compatible(command) {
        // everything is compatible at the top
        return true;
    }
};
