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
const { fallback, getExamples } = require('./fallback');
const permissionRuleDialog = require('./permission_rule');

const Helpers = require('../helpers');

async function handleUserInput(dlg, input) {
    let intent = input.intent;
    if (intent.isFailed) {
        await getExamples(dlg, intent.command);
    } else if (intent.isTrain) {
        await fallback(dlg, intent);
    } else if (intent.isUnsupported) {
        await dlg.reply(dlg._("Sorry, I don't know how to do that yet."));
    } else if (intent.isYes) {
        dlg.manager.stats.hit('sabrina-command-egg');
        await dlg.reply(dlg._("I agree, but to what?"));
    } else if (intent.isNo) {
        dlg.manager.stats.hit('sabrina-command-egg');
        await dlg.reply(dlg._("No way!"));
    } else if (intent.isExample) {
        await Helpers.presentSingleExample(dlg, intent.utterance, intent.targetCode);
    } else if (intent.isProgram || intent.isPrimitive) {
        dlg.manager.stats.hit('sabrina-command-rule');
        await ruleDialog(dlg, intent, input.confident);
    } else if (intent.isHelp || intent.isMake) {
        dlg.manager.stats.hit('sabrina-command-make');
        await makeDialog(dlg, intent);
    } else if (intent.isPermissionRule) {
        dlg.manager.stats.hit('sabrina-command-permissionrule');
        await permissionRuleDialog(dlg, intent, input.confident);
    } else {
        dlg.fail();
    }
}

module.exports = {
    handleUserInput,
};
