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

const permissionRuleDialog = require('../dialogs/permission_rule');

const DialogStackFrame = require('./base');

module.exports = class PermissionRuleStackFrame extends DialogStackFrame {
    compatible(command) {
        // FIXME all permission rules with the same functions are compatible with this stack frame
        return false;
    }

    async dispatch(intent) {
        this._dlg.manager.stats.hit('sabrina-command-permissionrule');
        await permissionRuleDialog(this._dlg, intent, intent.confident);
        this.complete();
    }
};
