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

const makeDialog = require('../dialogs/make');

const DialogStackFrame = require('./base');

/*
function isPrimitive(program) {
    if (program.rules.length !== 1 || program.rules[0].actions.length !== 1)
        return false;

    const rule = program.rules[0];
    const action = rule.actions[0];
    if (rule.isCommand) {
        if (!rule.table)
            return true;
        if (rule.table.isJoin)
            return false;

        if (action.isInvocation && action.invocation.selector.isBuiltin)
            return true;
        return false;
    }
    if (rule.isRule) {
        if (rule.stream.isJoin)
            return false;

        if (action.isInvocation && action.invocation.selector.isBuiltin)
            return true;
        return false;
    }

    return false;
}
*/

module.exports = class MakeDialogStackFrame extends DialogStackFrame {
    /*compatible(command) {
        if (command instanceof Intent.Program)
            return isPrimitive(command.program);

        return command instanceof Intent.Predicate ||
            command instanceof Intent.CommandList ||
            command instanceof Intent.Back ||
            command instanceof Intent.More ||
            command instanceof Intent.Empty ||
            command instanceof Intent.Make ||
            command instanceof Intent.Help;
    }*/

    setContext() {
        this._dlg.setContext(null);
        return super.setContext();
    }

    async dispatch(intent) {
        this._dlg.manager.stats.hit('sabrina-command-make');
        await makeDialog(this._dlg, intent);
        this.complete();
    }
};
