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

const { DialogStackFrame, AcceptResult } = require('./base');

module.exports = class TopLevelStackFrame extends DialogStackFrame {
    get expecting() {
        // at the top-level we don't expect anything (the interaction is complete)
        return null;
    }

    async accept(command) {
        if (command.isDebug) {
            await this._dlg.reply("I'm in the default state");
            return AcceptResult.HANDLED;
        }

        const accepted = await super.accept(command);
        if (accepted === AcceptResult.HANDLED || accepted === AcceptResult.COMPATIBLE)
            return accepted;

        // if we popped the stack due to a never mind, show a failure message
        if (command.isNeverMind)
            await this._dlg.reset();
        // if we popped the stack due to a cancellation, we don't need to dispatch the message,
        // but we need to reset the context
        if (command.isNeverMind || command.isStop) {
            this._dlg.setContext(null);
            return AcceptResult.HANDLED;
        }

        // in all the other cases, the command is compatible with the current stack
        // frame, because there is no other stack frame to pop
        return AcceptResult.COMPATIBLE;
    }
};
