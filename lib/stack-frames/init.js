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

const initDialog = require('../dialogs/init');

const DialogStackFrame = require('./base');

module.exports = class InitializationStackFrame extends DialogStackFrame {
    constructor(dlg, showWelcome, forceConfigureMatrix) {
        super(dlg);

        this.showWelcome = showWelcome;
        this.forceConfigureMatrix = forceConfigureMatrix;
    }

    async dispatch() {
        await initDialog(this._dlg, this.showWelcome, this.forceConfigureMatrix);
        this.complete();
    }
};
