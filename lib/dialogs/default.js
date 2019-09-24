// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ruleDialog = require('./rule');
const makeDialog = require('./make');
const { fallback } = require('./fallback');
const permissionRuleDialog = require('./permission_rule');

const Helpers = require('../helpers');
const { Intent } = require('../semantic');

async function handleUserInput(dlg, intent, confident) {
    if (intent instanceof Intent.Train) {
        await fallback(dlg, intent);
    } else if (intent.isYes) {
        dlg.manager.stats.hit('sabrina-command-egg');
        await dlg.reply(dlg._("I agree, but to what?"));
    } else if (intent.isNo) {
        dlg.manager.stats.hit('sabrina-command-egg');
        await dlg.reply(dlg._("No way!"));
    } else if (intent instanceof Intent.Example) {
        await Helpers.presentSingleExample(dlg, intent.utterance, intent.targetCode);
    } else if (intent instanceof Intent.Program) {
        dlg.manager.stats.hit('sabrina-command-rule');
        await ruleDialog(dlg, intent, confident);
    } else if (intent instanceof Intent.Help || intent instanceof Intent.Make) {
        dlg.manager.stats.hit('sabrina-command-make');
        await makeDialog(dlg, intent);
    } else if (intent instanceof Intent.PermissionRule) {
        dlg.manager.stats.hit('sabrina-command-permissionrule');
        await permissionRuleDialog(dlg, intent, confident);
    } else {
        dlg.fail();
    }
}

module.exports = {
    handleUserInput,
};
