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

const { ValueCategory } = require('../semantic');
const { DialogStackFrame, AcceptResult } = require('./base');

module.exports = class ResultStackFrame extends DialogStackFrame {
    get expecting() {
        return ValueCategory.MORE;
    }

    async accept(command) {
        const accepted = await super.accept(command);
        if (accepted === AcceptResult.HANDLED)
            return accepted;

        // if the user clicks more, more we let the intent through to rule.js
        if (command.isMore)
            return AcceptResult.COMPATIBLE;

        // otherwise, we pop the stack quietly
        return AcceptResult.INCOMPATIBLE;
    }
};
