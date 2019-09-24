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

const { slotFillCustom } = require('../dialogs/slot_filling');

module.exports = class AsyncQuestionStackFrame extends DialogStackFrame {
    constructor(dlg, appId, icon, type, question) {
        super(dlg);
        this._uniqueId = appId;
        this._icon = icon;
        this._type = type;
        this._question = question;
    }

    setContext() {
        this._dlg.currentAppId = this.uniqueId;
        super.setContext();
    }

    async dispatch() {
        let app;
        if (this._uniqueId !== undefined)
            app = this._manager.apps.getApp(this._uniqueId);
        else
            app = undefined;

        let question = this._question;
        if (app)
            question = this._dlg._("Question from %s: %s").format(app.name, question);

        this._dlg.icon = this._icon;
        let value = await slotFillCustom(this._dlg, this._type, question);
        this.complete(value.toJS());
    }
};
