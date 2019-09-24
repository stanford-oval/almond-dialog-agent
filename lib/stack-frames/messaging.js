// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { promptConfigure } = require('../dialogs/device_choice');

const DialogStackFrame = require('./base');

module.exports = class ConfigureMessagingStackFrame extends DialogStackFrame {
    setContext() {
        // push a null context while we're configuring matrix
        this._dlg.setContext(null);
        super.setContext();
    }

    async dispatch(dlg) {
        if (!this._manager.messaging.isAvailable) {
            await this._dlg.reply(this._dlg._("You need a Matrix account: I talk to other Almonds via the secure Matrix messaging service."));
            await this._dlg.replyLink(this._dlg._("Register a new Matrix account now"), 'https://riot.im/app/#/register');
            const newDevice = await promptConfigure(this._dlg, 'org.thingpedia.builtin.matrix');
            this.complete(newDevice !== null);
        } else {
            this.complete(true);
        }
    }
};
